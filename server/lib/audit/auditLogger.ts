
import { auditLogs } from "@shared/schema";

import { db } from "../../db";
import { logger } from "../../logger";
import { getCurrentTenantId, withTenant } from "../../utils/rlsContext";

export interface AuditEvent {
    tenantId?: string | null;
    workspaceId?: string | null;
    userId?: string; // Optional for system events
    action: string;
    resourceType: string;
    resourceId?: string;
    before?: unknown;
    after?: unknown;
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Executor that can run the audit insert — either the shared `db` handle or an
 * open transaction (`tx`). Callers writing inside a `db.transaction(async (tx) =>
 * ...)` block MUST pass `tx`; otherwise the insert tries to check out a second
 * pooled connection while the transaction holds one, which deadlocks (the test
 * pool has max=1, so it hangs until the hook timeout).
 */
type AuditExecutor = Pick<typeof db, "insert">;

export class AuditLogger {
    static async log(event: AuditEvent, executor?: AuditExecutor): Promise<void> {
        // RLS-5: an explicit event.tenantId wins; otherwise fall back to the
        // ambient tenant. Note these are two INDEPENDENT mechanisms and
        // conflating them is what made the first attempt at this fix useless:
        // a caller that opened its transaction via `withTenant(explicitId, …)`
        // sets the GUC WITHOUT populating the AsyncLocalStorage store, so
        // `getCurrentTenantId()` is undefined there even though a tenant is
        // very much pinned.
        const tenantId = event.tenantId ? event.tenantId : (getCurrentTenantId() ?? null);
        const values = {
            tenantId,
            // Coerce empty string to null: workspaceId maps to a uuid column,
            // and "" is not valid uuid syntax (aborts the caller's transaction).
            workspaceId: event.workspaceId ? event.workspaceId : null,
            userId: event.userId,
            action: event.action,
            entityType: event.resourceType,
            entityId: event.resourceId ?? 'global',
            resourceType: event.resourceType,
            resourceId: event.resourceId,

            changes: {
                before: event.before,
                after: event.after
            } as Record<string, unknown>,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent
        };
        try {
            if (executor) {
                // Caller is inside its own transaction and passed it — its GUC
                // governs, and opening our own here would deadlock the max:1
                // test pool (see the AuditExecutor note above).
                await executor.insert(auditLogs).values(values);
                return;
            }
            if (tenantId) {
                // RLS-5: no caller transaction, so this runs on the POOL with
                // no tenant GUC set — where the policy reads
                // `tenant_id IS NOT DISTINCT FROM NULL` and writing a REAL
                // tenant fails WITH CHECK. Because this method deliberately
                // swallows its errors, that failure is invisible: the audited
                // action succeeds and the audit row is silently dropped, which
                // is the worst shape for an audit trail. 188 of the RLS-5
                // run's violations were exactly this. Pin the row's own tenant
                // so the write is permitted.
                await withTenant(tenantId, async (tx) => {
                    await tx.insert(auditLogs).values(values);
                });
                return;
            }
            // Genuine system event with no tenant anywhere: NULL is writable
            // on the pool, since `NULL IS NOT DISTINCT FROM NULL` is true.
            await db.insert(auditLogs).values(values);
        } catch (error) {
            logger.error({ err: error }, "Failed to write audit log");
            // We do NOT throw here to avoid failing the user action if logging fails,
            // but in high security envs might want to fail-closed.
        }
    }
}
