/**
 * Stage 21: Workflow Template Mapping API Routes
 *
 * Endpoints for attaching/detaching templates to workflow versions
 */

import type { Express } from 'express';
import express from 'express';
import { requireAuth, asyncHandler } from '../middleware';
import { z } from 'zod';
import { workflowTemplateService } from '../services/WorkflowTemplateService';
import { createError } from '../utils/errors';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

/**
 * List all templates attached to a workflow version
 * GET /api/workflows/:workflowId/versions/:versionId/templates
 */
router.get(
  '/:workflowId/versions/:versionId/templates',
  asyncHandler(async (req, res) => {
    const { versionId } = req.params;

    const templates = await workflowTemplateService.listTemplates(versionId);

    res.json({
      success: true,
      data: templates,
    });
  })
);

/**
 * Get primary template for workflow version
 * GET /api/workflows/:workflowId/versions/:versionId/templates/primary
 */
router.get(
  '/:workflowId/versions/:versionId/templates/primary',
  asyncHandler(async (req, res) => {
    const { versionId } = req.params;

    const primary = await workflowTemplateService.getPrimaryTemplate(versionId);

    res.json({
      success: true,
      data: primary,
    });
  })
);

/**
 * Get template by key
 * GET /api/workflows/:workflowId/versions/:versionId/templates/:key
 */
router.get(
  '/:workflowId/versions/:versionId/templates/:key',
  asyncHandler(async (req, res) => {
    const { versionId, key } = req.params;

    const template = await workflowTemplateService.getTemplateByKey(versionId, key);

    res.json({
      success: true,
      data: template,
    });
  })
);

/**
 * Attach template to workflow version
 * POST /api/workflows/:workflowId/versions/:versionId/templates
 * Body: { templateId: string, projectId: string, key: string, isPrimary?: boolean }
 */
const attachSchema = z.object({
  templateId: z.string().uuid(),
  projectId: z.string().uuid(),
  key: z.string().min(1).max(100),
  isPrimary: z.boolean().optional().default(false),
});

router.post(
  '/:workflowId/versions/:versionId/templates',
  asyncHandler(async (req, res) => {
    const { versionId } = req.params;

    // Validate request body
    const body = attachSchema.parse(req.body);

    const mapping = await workflowTemplateService.attachTemplate({
      workflowVersionId: versionId,
      templateId: body.templateId,
      projectId: body.projectId,
      key: body.key,
      isPrimary: body.isPrimary,
    });

    res.status(201).json({
      success: true,
      data: mapping,
    });
  })
);

/**
 * Update template mapping
 * PATCH /api/workflow-templates/:mappingId?workflowVersionId=xxx
 * Body: { key?: string, isPrimary?: boolean }
 */
const updateSchema = z.object({
  key: z.string().min(1).max(100).optional(),
  isPrimary: z.boolean().optional(),
});

router.patch(
  '/workflow-templates/:mappingId',
  asyncHandler(async (req, res) => {
    const { mappingId } = req.params;
    const { workflowVersionId } = req.query;

    if (!workflowVersionId || typeof workflowVersionId !== 'string') {
      throw createError.badRequest('workflowVersionId query parameter is required');
    }

    // Validate request body
    const body = updateSchema.parse(req.body);

    const updated = await workflowTemplateService.updateTemplateMapping(
      mappingId,
      workflowVersionId,
      body
    );

    res.json({
      success: true,
      data: updated,
    });
  })
);

/**
 * Set template as primary
 * POST /api/workflow-templates/:mappingId/set-primary?workflowVersionId=xxx
 */
router.post(
  '/workflow-templates/:mappingId/set-primary',
  asyncHandler(async (req, res) => {
    const { mappingId } = req.params;
    const { workflowVersionId } = req.query;

    if (!workflowVersionId || typeof workflowVersionId !== 'string') {
      throw createError.badRequest('workflowVersionId query parameter is required');
    }

    const updated = await workflowTemplateService.setPrimaryTemplate(
      mappingId,
      workflowVersionId
    );

    res.json({
      success: true,
      data: updated,
    });
  })
);

/**
 * Detach template from workflow version
 * DELETE /api/workflow-templates/:mappingId?workflowVersionId=xxx
 */
router.delete(
  '/workflow-templates/:mappingId',
  asyncHandler(async (req, res) => {
    const { mappingId } = req.params;
    const { workflowVersionId } = req.query;

    if (!workflowVersionId || typeof workflowVersionId !== 'string') {
      throw createError.badRequest('workflowVersionId query parameter is required');
    }

    await workflowTemplateService.detachTemplate(mappingId, workflowVersionId);

    res.json({
      success: true,
      message: 'Template detached successfully',
    });
  })
);

/**
 * Register workflow template routes
 */
export function registerWorkflowTemplateRoutes(app: Express): void {
  app.use('/api/workflows', router);
  app.use('/api', router); // For workflow-templates paths
}

export default router;
