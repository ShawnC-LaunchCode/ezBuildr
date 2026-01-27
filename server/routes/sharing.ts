import { randomBytes } from "crypto";

import { eq, and } from "drizzle-orm";
import { Router, Request, Response } from "express";

import { workspaceMembers, workspaceInvitations, users } from "@shared/schema";

import { db } from "../db";
import { AuditLogger } from "../lib/audit/auditLogger";
import { ACTION } from "../lib/authz/checkPermission";
import { requireWorkspace, enforce } from "../lib/authz/enforce";
import { asyncHandler } from "../utils/asyncHandler";
const router = Router();
// Middleware: All sharing routes require a workspace context
router.use(requireWorkspace);
// List Workspace Members
router.get("/members", enforce(ACTION.VIEW_ANALYTICS), asyncHandler(async (req: Request, res: Response) => {
    const workspaceId = (req as any).workspaceId;
    // Join with user table to get names/emails
    const members = await db.query.workspaceMembers.findMany({
        where: eq(workspaceMembers.workspaceId, workspaceId),
        with: {
            user: true
        }
    });
    res.json(members);
}));
// Invite Member
router.post("/invite", enforce(ACTION.MANAGE_MEMBERS), asyncHandler(async (req: Request, res: Response) => {
    const workspaceId = (req as any).workspaceId;
    const { email, role } = req.body;
    const inviterId = (req as any).user!.id;
    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email)
    });
    if (existingUser) {
        // Direct add if user exists (simplified flow)
        // Check if already member
        const isMember = await db.query.workspaceMembers.findFirst({
            where: and(
                eq(workspaceMembers.workspaceId, workspaceId),
                eq(workspaceMembers.userId, existingUser.id)
            )
        });
        if (isMember) {
            return res.status(409).json({ error: "User is already a member" });
        }
        await db.insert(workspaceMembers).values({
            workspaceId,
            userId: existingUser.id,
            role: role || 'viewer',
            invitedBy: inviterId
        });
        await AuditLogger.log({
            workspaceId,
            userId: inviterId,
            action: 'member.add',
            resourceType: 'user',
            resourceId: existingUser.id,
            after: { role }
        });
        return res.json({ status: "added", userId: existingUser.id });
    } else {
        // Create invitation
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry
        await db.insert(workspaceInvitations).values({
            workspaceId,
            email,
            role: role || 'viewer',
            token,
            invitedBy: inviterId,
            expiresAt
        } as any);
        // In a real app, send email here
        await AuditLogger.log({
            workspaceId,
            userId: inviterId,
            action: 'member.invite',
            resourceType: 'email',
            resourceId: email,
            after: { role, token_generated: true }
        });
        return res.json({ status: "invited", email });
    }
}));
// Update Member Role
router.patch("/members/:userId", enforce(ACTION.MANAGE_MEMBERS), asyncHandler(async (req: Request, res: Response) => {
    const workspaceId = (req as any).workspaceId;
    const targetUserId = req.params.userId;
    const { role } = req.body;
    const actorId = (req as any).user!.id;
    if (targetUserId === actorId) {
        return res.status(400).json({ error: "Cannot change your own role" });
    }
    await db.update(workspaceMembers)
        .set({ role })
        .where(and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, targetUserId)
        ));
    await AuditLogger.log({
        workspaceId,
        userId: actorId,
        action: 'member.update_role',
        resourceType: 'user',
        resourceId: targetUserId,
        after: { role }
    });
    res.json({ success: true });
}));
export default router;