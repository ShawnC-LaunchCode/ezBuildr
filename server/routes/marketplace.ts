import { Router } from "express";

import { templateService } from "../lib/templates/TemplateService";
import { logger } from "../logger";

const router = Router();

// List templates
router.get("/templates", async (req, res) => {
    try {
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
    } catch (error) {
        logger.error({ err: error }, "Failed to list templates");
        res.status(500).json({ error: "Failed to list templates" });
    }
});

// Get template details
router.get("/templates/:id", async (req, res) => {
    try {
        const template = await templateService.getTemplate(req.params.id);
        if (!template) {
            return res.status(404).json({ error: "Template not found" });
        }
        res.json(template);
    } catch (error) {
        logger.error({ err: error }, "Failed to get template");
        res.status(500).json({ error: "Failed to get template" });
    }
});

// Install template
router.post("/templates/:id/install", async (req, res) => {
    try {
        const { projectId } = req.body;
        // Mock user context - in real app would get from session/JWT
        // We'll trust the projectId passed for now, assuming middleware checked existing access
        const { userId } = req.body || { userId: 'system' }; // Fallback

        const workflow = await templateService.installTemplate(
            req.params.id,
            { userId: userId || 'user_1', projectId }
        );

        res.json(workflow);
    } catch (error) {
        logger.error({ err: error }, "Failed to install template");
        res.status(500).json({ error: "Failed to install template" });
    }
});

// Publish workflow as template
router.post("/market/publish", async (req, res) => {
    try {
        const { workflowId, title, description, category, isPublic, userId } = req.body;

        const template = await templateService.publishTemplate(
            workflowId,
            { title, description, category, isPublic: !!isPublic },
            { userId: userId || 'user_1' }
        );

        res.json(template);
    } catch (error) {
        logger.error({ err: error }, "Failed to publish template");
        res.status(500).json({ error: "Failed to publish template" });
    }
});

export default router;
