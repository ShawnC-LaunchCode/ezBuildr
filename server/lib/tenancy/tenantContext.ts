
import { db } from "../../db";
import { workspaces } from "@shared/schema";
import { eq } from "drizzle-orm";

export class TenantContext {
    static async assertTenantBoundary(workspaceId: string, resource: any): Promise<void> {
        if (!resource) return;

        // If resource has workspaceId, it MUST match
        if (resource.workspaceId && resource.workspaceId !== workspaceId) {
            throw new Error("Security Violation: Resource belongs to a different tenant");
        }

        // If resource has organizationId check (less common for direct resource access but possible)
        // ...
    }

    static async validateWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
        // This is redundancy for checkPermission but useful for hard boundary checks
        const workspace = await db.query.workspaces.findFirst({
            where: eq(workspaces.id, workspaceId),
            with: {
                members: {
                    where: (members: any, { eq }: any) => eq(members.userId, userId)
                }
            }
        });

        return !!workspace && workspace.members.length > 0;
    }
}
