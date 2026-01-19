import { eq, and } from "drizzle-orm";
import { workspaceMembers, resourcePermissions } from "@shared/schema";
import { db } from "../../db";
export const ACTION = {
    VIEW_WORKFLOW: 'workflow.view',
    EDIT_WORKFLOW: 'workflow.edit',
    PUBLISH_WORKFLOW: 'workflow.publish',
    DELETE_WORKFLOW: 'workflow.delete',
    MANAGE_MEMBERS: 'workspace.members.manage',
    MANAGE_BILLING: 'workspace.billing',
    VIEW_ANALYTICS: 'analytics.view',
};
const ROLE_CAPABILITIES = {
    viewer: [ACTION.VIEW_WORKFLOW, ACTION.VIEW_ANALYTICS],
    contributor: [ACTION.VIEW_WORKFLOW, ACTION.EDIT_WORKFLOW], // Cannot publish
    editor: [ACTION.VIEW_WORKFLOW, ACTION.EDIT_WORKFLOW, ACTION.PUBLISH_WORKFLOW, ACTION.DELETE_WORKFLOW],
    admin: [
        ACTION.VIEW_WORKFLOW, ACTION.EDIT_WORKFLOW, ACTION.PUBLISH_WORKFLOW, ACTION.DELETE_WORKFLOW,
        ACTION.MANAGE_MEMBERS, ACTION.MANAGE_BILLING, ACTION.VIEW_ANALYTICS
    ],
    owner: ['*'] // All permissions
};
export async function checkPermission(
    userId: string,
    workspaceId: string,
    action: string,
    resourceType?: string,
    resourceId?: string
): Promise<boolean> {
    // 1. Get Workspace Role
    const member = await db.query.workspaceMembers.findFirst({
        where: and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, userId)
        )
    });
    if (!member) {
        return false; // Not a member
    }
    // 2. Check Role Capabilities
    if (checkRoleHasCapability(member.role, action)) {
        return true;
    }
    // 3. Check Resource-Specific Override (if applicable)
    if (resourceType && resourceId) {
        const override = await db.query.resourcePermissions.findFirst({
            where: and(
                eq(resourcePermissions.workspaceId, workspaceId),
                eq(resourcePermissions.userId, userId),
                eq(resourcePermissions.resourceType, resourceType),
                eq(resourcePermissions.resourceId, resourceId),
                eq(resourcePermissions.action, action) // Permissions are granular per action
            )
        });
        if (override) {
            return override.allowed;
        }
    }
    return false;
}
function checkRoleHasCapability(role: string, action: string): boolean {
    const capabilities = ROLE_CAPABILITIES[role as keyof typeof ROLE_CAPABILITIES] || [];
    if (capabilities.includes('*')) {return true;}
    return capabilities.includes(action);
}