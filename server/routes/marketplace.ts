/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { Router } from "express";

import { marketplaceService } from "../lib/templates/MarketplaceService";
import { asyncHandler } from "../utils/asyncHandler";
import { hybridAuth } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";

const router = Router();
// List templates
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get("/templates", hybridAuth, requireTenant, asyncHandler(async (req: any, res) => {
    const { category, search, scope } = req.query;
    // Default to public templates
    const _isPublic = scope === 'private' ? false : true;
    // If asking for private, assume org-scoped (TODO: getting orgId from auth context)
    // For now, in v1, we mostly focus on public templates
    const templates = await marketplaceService.listTemplates({
        category: category as string,
        search: search as string,
        isPublic: true // Force public for now until full auth context is passed
    });
    res.json(templates);
}));
// Get template details
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get("/templates/:id", hybridAuth, requireTenant, asyncHandler(async (req: any, res) => {
    const template = await marketplaceService.getTemplate(req.params.id);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!template) {
        return res.status(404).json({ error: "Template not found" });
    }
    res.json(template);
}));
// Install template
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.post("/templates/:id/install", hybridAuth, requireTenant, asyncHandler(async (req: any, res) => {
    const { projectId } = req.body;
    const userId = req.user.id;
    const workflow = await marketplaceService.installTemplate(
        req.params.id,
        { userId, projectId }
    );
    res.json(workflow);
}));
// Publish workflow as template
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.post("/market/publish", hybridAuth, requireTenant, asyncHandler(async (req: any, res) => {
    const { workflowId, title, description, category, isPublic } = req.body;
    const userId = req.user.id;
    const template = await marketplaceService.publishTemplate(
        workflowId,
        { title, description, category, isPublic: !!isPublic },
        { userId }
    );
    res.json(template);
}));
export default router;