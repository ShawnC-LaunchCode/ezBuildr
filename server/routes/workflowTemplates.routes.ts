/**
 * Stage 21: Workflow Template Mapping API Routes
 *
 * Endpoints for attaching/detaching templates to workflow versions
 */

import { eq } from 'drizzle-orm';
import express from 'express';
import { z } from 'zod';

import { workflowVersions } from '@shared/schema';

import { db } from '../db';
import { asyncHandler } from '../middleware';
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { workflowService } from '../services/WorkflowService';
import { workflowTemplateService } from '../services/WorkflowTemplateService';
import { createError } from '../utils/errors';

import type { Express } from 'express';

const router = express.Router();

// All routes require authentication
router.use(hybridAuth);

/**
 * List all templates attached to a workflow version
 * GET /api/workflows/:workflowId/versions/:versionId/templates
 */
router.get(
  '/:workflowId/versions/:versionId/templates',
  asyncHandler(async (req, res) => {
    const { workflowId, versionId } = req.params;
    
    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) throw createError.unauthorized('Authentication required');
    await workflowService.verifyAccess(workflowId, userId);

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
    const { workflowId, versionId } = req.params;
    
    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) throw createError.unauthorized('Authentication required');
    await workflowService.verifyAccess(workflowId, userId);

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
    const { workflowId, versionId, key } = req.params;
    
    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) throw createError.unauthorized('Authentication required');
    await workflowService.verifyAccess(workflowId, userId);

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
    const { workflowId, versionId } = req.params;
    
    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) throw createError.unauthorized('Authentication required');
    await workflowService.verifyAccess(workflowId, userId);

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

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- query param validation
    if (!workflowVersionId || typeof workflowVersionId !== 'string') {
      throw createError.validation('workflowVersionId query parameter is required');
    }

    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) throw createError.unauthorized('Authentication required');
    const version = await db.query.workflowVersions.findFirst({
      where: eq(workflowVersions.id, workflowVersionId)
    });
    if (!version) throw createError.notFound('Workflow version');
    await workflowService.verifyAccess(version.workflowId, userId);

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

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- query param validation
    if (!workflowVersionId || typeof workflowVersionId !== 'string') {
      throw createError.validation('workflowVersionId query parameter is required');
    }

    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) throw createError.unauthorized('Authentication required');
    const version = await db.query.workflowVersions.findFirst({
      where: eq(workflowVersions.id, workflowVersionId)
    });
    if (!version) throw createError.notFound('Workflow version');
    await workflowService.verifyAccess(version.workflowId, userId);

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

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- query param validation
    if (!workflowVersionId || typeof workflowVersionId !== 'string') {
      throw createError.validation('workflowVersionId query parameter is required');
    }

    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) throw createError.unauthorized('Authentication required');
    const version = await db.query.workflowVersions.findFirst({
      where: eq(workflowVersions.id, workflowVersionId)
    });
    if (!version) throw createError.notFound('Workflow version');
    await workflowService.verifyAccess(version.workflowId, userId);

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
