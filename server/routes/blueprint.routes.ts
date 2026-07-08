/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { Router, Express } from 'express';

import { logger } from '../logger';
import { requireAuth } from '../middleware/auth';
import { projectService } from '../services/ProjectService';
import { templateService } from '../services/TemplateService';
import { asyncHandler } from '../utils/asyncHandler';
import { classifyRouteError } from '../utils/routeErrors';

const router = Router();

// List blueprints
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.get('/', requireAuth, asyncHandler(async (req, res) => {
    try {
        if (!req.user?.tenantId) { return res.status(401).json({ error: 'Tenant required' }); }
        const tenantId = req.user.tenantId;
        // Reuse listTemplates but maybe rename method later for consistency
        const templates = await templateService.listTemplates(tenantId, req.user?.id, true);
        res.json({ data: templates });
    } catch (error) {
        logger.error({ error }, 'List blueprints error');
        res.status(500).json({ error: 'Failed to list blueprints' });
    }
}));

// Create blueprint (Save as Template)
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post('/', requireAuth, asyncHandler(async (req, res) => {
    try {
        const { name, description, sourceWorkflowId, metadata, isPublic } = req.body;

        if (!name || !sourceWorkflowId) {
            res.status(400).json({ error: "Name and Source Workflow ID are required" });
            return;
        }

        const template = await templateService.createFromWorkflow({
            name,
            description,
            sourceWorkflowId,
            creatorId: req.user!.id as string,
            tenantId: req.user!.tenantId!,
            metadata,
            isPublic
        });

        res.json({ data: template });
    } catch (error) {
        logger.error({ error }, 'Create blueprint error');
        res.status(500).json({ error: 'Failed to create blueprint' });
    }
}));

// Instantiate blueprint
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post('/:id/instantiate', requireAuth, asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const { projectId, name } = req.body;

        if (projectId) {
            await projectService.verifyOwnership(projectId, req.user!.id as string);
        }

        const result = await templateService.instantiate({
            templateId: id,
            projectId,
            userId: req.user!.id as string,
            tenantId: req.user!.tenantId!,
            name
        });

        res.json({ data: result });
    } catch (error) {
        logger.error({ error }, 'Instantiate blueprint error');
        const { status, message } = classifyRouteError(error, 'Failed to instantiate blueprint');
        res.status(status).json({ error: message });
    }
}));

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function registerBlueprintRoutes(app: Express) {
    app.use('/api/blueprints', router);
}
