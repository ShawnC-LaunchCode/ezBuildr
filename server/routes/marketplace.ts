import { Router } from "express";
import { templateService } from "../lib/templates/TemplateService";
const router = Router();
import { asyncHandler } from "../utils/asyncHandler";
// List templates
router.get("/templates", asyncHandler(async (req, res) => {
    const { category, search, scope } = req.query;
    // Default to public templates
    const isPublic = scope === 'private' ? false : true;
    // If asking for private, assume org-scoped (TODO: getting orgId from auth context)
    // For now, in v1, we mostly focus on public templates
    const templates = await templateService.listTemplates({
        category: category as string,
        search: search as string,
        isPublic: true // Force public for now until full auth context is passed
    });
    res.json(templates);
}));
// Get template details
router.get("/templates/:id", asyncHandler(async (req, res) => {
    const template = await templateService.getTemplate(req.params.id);
    if (!template) {
        return res.status(404).json({ error: "Template not found" });
    }
    res.json(template);
}));
// Install template
router.post("/templates/:id/install", asyncHandler(async (req, res) => {
    const { projectId } = req.body;
    // Mock user context - in real app would get from session/JWT
    // We'll trust the projectId passed for now, assuming middleware checked existing access
    const { userId } = req.body || { userId: 'system' }; // Fallback
    const workflow = await templateService.installTemplate(
        req.params.id,
        { userId: userId || 'user_1', projectId }
    );
    res.json(workflow);
}));
// Publish workflow as template
router.post("/market/publish", asyncHandler(async (req, res) => {
    const { workflowId, title, description, category, isPublic, userId } = req.body;
    const template = await templateService.publishTemplate(
        workflowId,
        { title, description, category, isPublic: !!isPublic },
        { userId: userId || 'user_1' }
    );
    res.json(template);
}));
export default router;