
import { Router } from "express";
import { db } from "../db";
import { organizations, workspaces, users } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

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
router.get("/organizations", async (req, res) => {
    const orgs = await db.query.organizations.findMany({
        with: {
            workspaces: true
        }
    });
    res.json(orgs);
});

// Create Organization (Platform Level)
router.post("/organizations", async (req, res) => {
    const { name, slug, domain } = req.body;

    try {
        const [org] = await db.insert(organizations).values({
            name,
            slug,
            domain
        }).returning();

        // Auto-create default workspace
        await db.insert(workspaces).values({
            organizationId: org.id,
            name: "Default Workspace",
            slug: "default"
        });

        res.json(org);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// System Stats (Global)
router.get("/stats", async (req, res) => {
    const orgCount = (await db.select().from(organizations)).length;
    const userCount = (await db.select().from(users)).length;
    const workspaceCount = (await db.select().from(workspaces)).length;

    res.json({
        orgCount,
        userCount,
        workspaceCount,
        timestamp: new Date()
    });
});

export default router;
