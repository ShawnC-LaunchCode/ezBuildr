import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { marketplaceService } from "../lib/templates/MarketplaceService";
import { asyncHandler } from "../utils/asyncHandler";
import { classifyRouteError } from "../utils/routeErrors";
import { logger } from "../logger";
import { hybridAuth, type AuthRequest } from "../middleware/auth";
import { requireTenant } from "../middleware/tenant";

const router = Router();

// Matches the repo-wide inline UUID check (see WorkflowTenantResolver.ts,
// sections.routes.ts, steps.routes.ts, ...).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `GET /api/templates/:id` is also served by the Stage-4 document-templates
 * router (`templates.routes.ts`), which is mounted right after this one and
 * keys its templates by UUID. Curated marketplace ids are static slugs
 * (`nda`, `retainer-agreement`, ...), never UUIDs, so a UUID-shaped `:id`
 * cannot be a marketplace request — skip straight to the document-templates
 * handler instead of answering with our own 404 (TM-2; see
 * `server/routes/index.ts` for why registration order also matters here).
 */
function skipUuidIds(req: Request, res: Response, next: NextFunction): void {
    if (UUID_REGEX.test(req.params.id)) {
        next("route");
        return;
    }
    next();
}
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
router.get("/templates/:id", skipUuidIds, hybridAuth, requireTenant, asyncHandler(async (req: AuthRequest, res) => {
    const { id } = templateIdParamsSchema.parse(req.params);
    const template = await marketplaceService.getTemplate(id);
    if (template === null) {
        return res.status(404).json({ error: "Template not found" });
    }
    res.json(template);
}));
// Install template
router.post("/templates/:id/install", hybridAuth, requireTenant, asyncHandler(async (req: AuthRequest, res) => {
    const { id } = templateIdParamsSchema.parse(req.params);
    const { projectId } = installTemplateSchema.parse(req.body);
    const userId = requireUserId(req);
    // Classify at the route, per CLAUDE.md convention 2 / the add-api-endpoint
    // skill: `installTemplate` and the `ImportService` beneath it signal
    // authorization and not-found through message phrasings ("Template not
    // found", "Target project not found", "Access denied - ..."). Relying on
    // the global `errorHandler` instead is not enough — `registerRoutes` does
    // not install it (only `server/index.ts` and `server/production.ts` do),
    // so anything built from `registerRoutes` alone answers 500 to a denial.
    try {
        const workflow = await marketplaceService.installTemplate(
            id,
            { userId, projectId }
        );
        res.json(workflow);
    } catch (error) {
        logger.error({ error, templateId: id, projectId }, 'Error installing template');
        const { status, message } = classifyRouteError(error, 'Failed to install template');
        res.status(status).json({ message });
    }
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
