import { Router, Express } from 'express';

import { requireAuth } from '../middleware/auth';
import { templateService } from '../services/TemplateService';

const router = Router();

// List blueprints
router.get('/', requireAuth, async (req, res) => {
    try {
        const tenantId = req.user?.tenantId || 'default-tenant';
        // Reuse listTemplates but maybe rename method later for consistency
        const templates = await templateService.listTemplates(tenantId, req.user?.id, true);
        res.json({ data: templates });
    } catch (error) {
        console.error('List blueprints error:', error);
        res.status(500).json({ error: 'Failed to list blueprints' });
    }
});

// Create blueprint (Save as Template)
router.post('/', requireAuth, async (req, res) => {
    try {
        const { name, description, sourceWorkflowId, metadata, isPublic } = req.body;

        if (!name || !sourceWorkflowId) {
            return res.status(400).json({ error: "Name and Source Workflow ID are required" });
        }

        const template = await templateService.createFromWorkflow({
            name,
            description,
            sourceWorkflowId,
            creatorId: req.user!.id as string,
            tenantId: req.user?.tenantId || 'default-tenant',
            metadata,
            isPublic
        });

        res.json({ data: template });
    } catch (error) {
        console.error('Create blueprint error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create blueprint' });
    }
});

// Instantiate blueprint
router.post('/:id/instantiate', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { projectId, name } = req.body;

        // if (!projectId) {
        //     return res.status(400).json({ error: "Target Project ID is required" });
        // }

        const result = await templateService.instantiate({
            templateId: id,
            projectId,
            userId: req.user!.id as string,
            tenantId: req.user?.tenantId || 'default-tenant',
            name
        });

        res.json({ data: result });
    } catch (error) {
        console.error('Instantiate blueprint error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to instantiate blueprint' });
    }
});

export function registerBlueprintRoutes(app: Express) {
    app.use('/api/blueprints', router);
}
