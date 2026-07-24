/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { Router, Express } from 'express';

import { logger } from '../logger';
import { requireAuth } from '../middleware/auth';
import { requireUser, type UserRequest } from '../middleware/requireUser';
import { aclService } from '../services/AclService';
import { templateService } from '../services/TemplateService';
import { asyncHandler } from '../utils/asyncHandler';
import { classifyRouteError } from '../utils/routeErrors';

const router = Router();

// List blueprints
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.get('/', requireAuth, requireUser, asyncHandler(async (req, res) => {
    try {
        const { user } = req as UserRequest;
        if (!user.tenantId) { return res.status(401).json({ error: 'Tenant required' }); }
        // Reuse listTemplates but maybe rename method later for consistency
        const templates = await templateService.listTemplates(user.tenantId, user.id, true);
        res.json({ data: templates });
    } catch (error) {
        logger.error({ error }, 'List blueprints error');
        res.status(500).json({ error: 'Failed to list blueprints' });
    }
}));

// Create blueprint (Save as Template)
// eslint-disable-next-line @typescript-eslint/no-misused-promises
router.post('/', requireAuth, requireUser, asyncHandler(async (req, res) => {
    try {
        const { name, description, sourceWorkflowId, metadata, isPublic } = req.body;

        if (!name || !sourceWorkflowId) {
            res.status(400).json({ error: "Name and Source Workflow ID are required" });
            return;
        }

        const { user } = req as UserRequest;
        if (!user.tenantId) { return res.status(401).json({ error: 'Tenant required' }); }

        const template = await templateService.createFromWorkflow({
            name,
            description,
            sourceWorkflowId,
            creatorId: user.id,
            tenantId: user.tenantId,
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
router.post('/:id/instantiate', requireAuth, requireUser, asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const { projectId, name } = req.body;
        const { user } = req as UserRequest;
        if (!user.tenantId) { return res.status(401).json({ error: 'Tenant required' }); }

        if (projectId) {
            const hasProjectAccess = await aclService.hasProjectRole(user.id, projectId, 'edit');
            if (!hasProjectAccess) {
                throw new Error("Access denied - insufficient permissions for this project");
            }
        }

        const result = await templateService.instantiate({
            templateId: id,
            projectId,
            userId: user.id,
            tenantId: user.tenantId,
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
