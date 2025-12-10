
import { db } from "../../db";
import { auditLogs } from "@shared/schema";

export interface AuditEvent {
    workspaceId: string;
    userId?: string; // Optional for system events
    action: string;
    resourceType: string;
    resourceId?: string;
    before?: any;
    after?: any;
    ipAddress?: string;
    userAgent?: string;
}

export class AuditLogger {
    static async log(event: AuditEvent) {
        try {
            await db.insert(auditLogs).values({
                workspaceId: event.workspaceId,
                userId: event.userId,
                action: event.action,
                resourceType: event.resourceType,
                resourceId: event.resourceId,
                changes: {
                    before: event.before,
                    after: event.after
                },
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
