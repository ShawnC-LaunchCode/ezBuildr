import { eq, desc } from "drizzle-orm";
import { Router } from "express";

import { organizations, workspaces, users } from "@shared/schema";
import { asyncHandler } from "../utils/asyncHandler";

import { db } from "../db";

const router = Router();

// Super Admin Middleware (Simplified for now - assumes a specific user ID or role)
// In production, check for user.isSuperAdmin boolean or specific role in DB
const requireSuperAdmin = (req: any, res: any, next: any) => {
    if (req.user?.role !== 'admin') { // Using legacy 'admin' role as super admin for now
        return res.status(403).json({ error: "Require Super Admin" });
    }
    next();
};

router.use(requireSuperAdmin);

// List All Organizations
router.get("/organizations", asyncHandler(async (req, res) => {
    const orgs = await db.query.organizations.findMany({
        with: {
            workspaces: true
        }
    });
    res.json(orgs);
}));

// Create Organization (Platform Level)
router.post("/organizations", asyncHandler(async (req, res) => {
    const { name, slug, domain } = req.body;

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
