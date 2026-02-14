/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
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
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.get("/members", enforce(ACTION.VIEW_ANALYTICS), asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- workspaceId added by middleware, @typescript-eslint/no-unsafe-member-access
    const workspaceId = (req as any).workspaceId as string;
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
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post("/invite", enforce(ACTION.MANAGE_MEMBERS), asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- workspaceId added by middleware, @typescript-eslint/no-unsafe-member-access
    const workspaceId = (req as any).workspaceId as string;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- request body not typed
    const { email, role } = req.body;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-member-access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user from auth middleware, @typescript-eslint/no-unsafe-member-access
    const inviterId = (req as any).user!.id as string;
    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
            res.status(409).json({ error: "User is already a member" });
            return;
        }
        await db.insert(workspaceMembers).values({
            workspaceId,
            userId: existingUser.id,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- role from request body
            role: role ?? 'viewer',
            invitedBy: inviterId
        });
        await AuditLogger.log({
            workspaceId,
            userId: inviterId,
            action: 'member.add',
            resourceType: 'user',
            resourceId: existingUser.id,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- role from request body
            after: { role }
        });
        res.json({ status: "added", userId: existingUser.id });
        // eslint-disable-next-line sonarjs/no-redundant-jump
        return;
    } else {
        // Create invitation
        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await db.insert(workspaceInvitations).values({
            workspaceId,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- email from request body
            email,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- role from request body
            role: role ?? 'viewer',
            token,
            invitedBy: inviterId,
            expiresAt
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drizzle insert type mismatch
        } as any);
        // In a real app, send email here
        await AuditLogger.log({
            workspaceId,
            userId: inviterId,
            action: 'member.invite',
            resourceType: 'email',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- email from request body
            resourceId: email,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- role from request body
            after: { role, token_generated: true }
        });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- email from request body
        res.json({ status: "invited", email });
        // eslint-disable-next-line sonarjs/no-redundant-jump
        return;
    }
}));
// Update Member Role
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.patch("/members/:userId", enforce(ACTION.MANAGE_MEMBERS), asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- workspaceId added by middleware, @typescript-eslint/no-unsafe-member-access
    const workspaceId = (req as any).workspaceId as string;
    const targetUserId = req.params.userId;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- request body not typed
    const { role } = req.body;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-member-access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user from auth middleware, @typescript-eslint/no-unsafe-member-access
    const actorId = (req as any).user!.id as string;
    if (targetUserId === actorId) {
        res.status(400).json({ error: "Cannot change your own role" });
        return;
    }
    await db.update(workspaceMembers)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- role from request body
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- role from request body
        after: { role }
    });
    res.json({ success: true });
}));
export default router;