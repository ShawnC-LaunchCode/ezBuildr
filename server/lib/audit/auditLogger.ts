
import { auditLogs } from "@shared/schema";

import { db } from "../../db";

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

export class AuditLogger {
    static async log(event: AuditEvent): Promise<void> {
        try {
            await db.insert(auditLogs).values({
                workspaceId: event.workspaceId ?? null,
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
            console.error("Failed to write audit log:", error);
            // We do NOT throw here to avoid failing the user action if logging fails, 
            // but in high security envs might want to fail-closed.
        }
    }
}
