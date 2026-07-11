
import { auditLogs } from "@shared/schema";

import { db } from "../../db";
import { logger } from "../../logger";

export interface AuditEvent {
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
    static async log(event: AuditEvent, executor: AuditExecutor = db): Promise<void> {
        try {
            await executor.insert(auditLogs).values({
                // Coerce empty string to null: workspaceId maps to a uuid column,
                // and "" is not valid uuid syntax (aborts the caller's transaction).
                workspaceId: event.workspaceId ? event.workspaceId : null,
                userId: event.userId,
                action: event.action,
                entityType: event.resourceType,
                entityId: event.resourceId ?? 'global',
                resourceType: event.resourceType,
                resourceId: event.resourceId,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- audit event before/after are typed as unknown but DB column accepts jsonb
                changes: {
                    before: event.before,
                    after: event.after
                } as Record<string, unknown>,
                ipAddress: event.ipAddress,
                userAgent: event.userAgent
            });
        } catch (error) {
            logger.error({ err: error }, "Failed to write audit log");
            // We do NOT throw here to avoid failing the user action if logging fails, 
            // but in high security envs might want to fail-closed.
        }
    }
}
