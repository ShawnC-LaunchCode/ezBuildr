/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { _eq, _desc } from "drizzle-orm";
import { Router } from "express";

import { organizations, workspaces, users } from "@shared/schema";

import { z } from "zod";
import { db } from "../db";
import { asyncHandler } from "../utils/asyncHandler";
import { hybridAuth } from "../middleware/auth";
import { isAdmin } from "../middleware/adminAuth";

const router = Router();

router.use(hybridAuth, isAdmin);

// List All Organizations
router.get("/organizations", asyncHandler(async (req, res) => {
    const orgs = await db.query.organizations.findMany({
        with: {
            workspaces: true
        }
    });
    res.json(orgs);
}));

const createOrgSchema = z.object({
    name: z.string().min(1).max(255),
    slug: z.string().regex(/^[a-z0-9-]+$/).min(1).max(255),
    domain: z.string().optional()
});

// Create Organization (Platform Level)
router.post("/organizations", asyncHandler(async (req, res) => {
    const parseResult = createOrgSchema.safeParse(req.body);
    if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid organization data", details: parseResult.error });
    }
    const { name, slug, domain } = parseResult.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- req augmented with user
    const { user } = req as any;
    const tenantId = user?.tenantId;

    if (!tenantId) {
        return res.status(400).json({ error: "Super Admin has no tenant context" });
    }

    const [org] = await db.insert(organizations).values({
        name,
        slug,
        domain,
        tenantId,
        createdByUserId: user.id
    }).returning();

    // Auto-create default workspace
    await db.insert(workspaces).values({
        organizationId: org.id,
        name: "Default Workspace",
        slug: "default"
    });

    res.json(org);
}));

// System Stats (Global)
router.get("/stats", asyncHandler(async (req, res) => {
    const orgCount = (await db.select().from(organizations)).length;
    const userCount = (await db.select().from(users)).length;
    const workspaceCount = (await db.select().from(workspaces)).length;

    res.json({
        orgCount,
        userCount,
        workspaceCount,
        timestamp: new Date()
    });
}));

export default router;
