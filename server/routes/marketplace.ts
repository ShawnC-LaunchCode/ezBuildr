import { Router } from "express";
import { z } from "zod";

import { marketplaceService } from "../lib/templates/MarketplaceService";
import { asyncHandler } from "../utils/asyncHandler";
import { hybridAuth, type AuthRequest } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";

const router = Router();
const templateIdParamsSchema = z.object({ id: z.string().min(1) });
const listTemplatesQuerySchema = z.object({
    category: z.string().optional(),
    search: z.string().optional(),
    scope: z.enum(['private', 'public']).optional(),
});
const installTemplateSchema = z.object({ projectId: z.string().min(1) });
const publishTemplateSchema = z.object({
    workflowId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    isPublic: z.boolean().optional(),
});

function requireUserId(req: AuthRequest): string {
    if (!req.userId) {
        throw new Error('Unauthorized');
    }
    return req.userId;
}

// List templates
router.get("/templates", hybridAuth, requireTenant, asyncHandler(async (req: AuthRequest, res) => {
    const { category, search, scope } = listTemplatesQuerySchema.parse(req.query);
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
router.get("/templates/:id", hybridAuth, requireTenant, asyncHandler(async (req: AuthRequest, res) => {
    const { id } = templateIdParamsSchema.parse(req.params);
    const template = await marketplaceService.getTemplate(id);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!template) {
        return res.status(404).json({ error: "Template not found" });
    }
    res.json(template);
}));
// Install template
router.post("/templates/:id/install", hybridAuth, requireTenant, asyncHandler(async (req: AuthRequest, res) => {
    const { id } = templateIdParamsSchema.parse(req.params);
    const { projectId } = installTemplateSchema.parse(req.body);
    const userId = requireUserId(req);
    const workflow = await marketplaceService.installTemplate(
        id,
        { userId, projectId }
    );
    res.json(workflow);
}));
// Publish workflow as template
router.post("/market/publish", hybridAuth, requireTenant, asyncHandler(async (req: AuthRequest, res) => {
    const { workflowId, title, description, category, isPublic } = publishTemplateSchema.parse(req.body);
    const userId = requireUserId(req);
    const template = await marketplaceService.publishTemplate(
        workflowId,
        { title, description, category, isPublic: isPublic ?? false },
        { userId }
    );
    res.json(template);
}));
export default router;
