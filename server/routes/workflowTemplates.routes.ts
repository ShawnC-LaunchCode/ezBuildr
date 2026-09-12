const AUTH_REQUIRED = 'Authentication required';
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
import { aclService } from '../services/AclService';
import { workflowService } from '../services/WorkflowService';
import { workflowTemplateService } from '../services/WorkflowTemplateService';
import { createError } from '../utils/errors';
import { withCurrentTenant } from "../utils/rlsContext";

import type { Express } from 'express';

const workflowVersionTemplatesRouter = express.Router();
const workflowTemplateMappingsRouter = express.Router();

// Route-level auth is intentional: these routers are mounted at broad prefixes
// and must not pre-authenticate unrelated /api or /api/workflows endpoints.

/**
 * List all templates attached to a workflow version
 * GET /api/workflows/:workflowId/versions/:versionId/templates
 */
workflowVersionTemplatesRouter.get(
  '/:workflowId/versions/:versionId/templates',
  hybridAuth,
  asyncHandler(async (req, res) => {
    const { workflowId, versionId } = req.params;
    
    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) {throw createError.unauthorized(AUTH_REQUIRED);}
    await workflowService.verifyAccess(workflowId, userId);

    const version = await db.query.workflowVersions.findFirst({ where: eq(workflowVersions.id, versionId) });
    if (!version || version.workflowId !== workflowId) {throw createError.notFound('Workflow version not found for this workflow');}

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
workflowVersionTemplatesRouter.get(
  '/:workflowId/versions/:versionId/templates/primary',
  hybridAuth,
  asyncHandler(async (req, res) => {
    const { workflowId, versionId } = req.params;
    
    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) {throw createError.unauthorized(AUTH_REQUIRED);}
    await workflowService.verifyAccess(workflowId, userId);

    const version = await db.query.workflowVersions.findFirst({ where: eq(workflowVersions.id, versionId) });
    if (!version || version.workflowId !== workflowId) {throw createError.notFound('Workflow version not found for this workflow');}

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
workflowVersionTemplatesRouter.get(
  '/:workflowId/versions/:versionId/templates/:key',
  hybridAuth,
  asyncHandler(async (req, res) => {
    const { workflowId, versionId, key } = req.params;
    
    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) {throw createError.unauthorized(AUTH_REQUIRED);}
    await workflowService.verifyAccess(workflowId, userId);

    const version = await db.query.workflowVersions.findFirst({ where: eq(workflowVersions.id, versionId) });
    if (!version || version.workflowId !== workflowId) {throw createError.notFound('Workflow version not found for this workflow');}

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

workflowVersionTemplatesRouter.post(
  '/:workflowId/versions/:versionId/templates',
  hybridAuth,
  asyncHandler(async (req, res) => {
    const { workflowId, versionId } = req.params;
    
    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) {throw createError.unauthorized(AUTH_REQUIRED);}
    await workflowService.verifyAccess(workflowId, userId);

    const version = await db.query.workflowVersions.findFirst({ where: eq(workflowVersions.id, versionId) });
    if (!version || version.workflowId !== workflowId) {throw createError.notFound('Workflow version not found for this workflow');}

    // Validate request body
    const body = attachSchema.parse(req.body);

    // SECURITY: the template is resolved by (templateId, projectId) with no
    // tenant scoping downstream, so verify the caller can actually access the
    // project the template lives in — otherwise a caller who knows another
    // tenant's templateId + projectId could attach that template to their own
    // workflow (cross-tenant template disclosure at document generation).
    const hasProjectAccess = await withCurrentTenant((aclTx) => aclService.hasProjectRole(userId, body.projectId, 'view', aclTx));
    if (!hasProjectAccess) {
      throw createError.notFound('Template');
    }

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
  pinnedVersionId: z.string().uuid().nullable().optional(),
});

workflowTemplateMappingsRouter.patch(
  '/workflow-templates/:mappingId',
  hybridAuth,
  asyncHandler(async (req, res) => {
    const { mappingId } = req.params;
    const { workflowVersionId } = req.query;

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- query param validation
    if (!workflowVersionId || typeof workflowVersionId !== 'string') {
      throw createError.validation('workflowVersionId query parameter is required');
    }

    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) {throw createError.unauthorized(AUTH_REQUIRED);}
    const version = await db.query.workflowVersions.findFirst({
      where: eq(workflowVersions.id, workflowVersionId)
    });
    if (!version) {throw createError.notFound('Workflow version');}
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
workflowTemplateMappingsRouter.post(
  '/workflow-templates/:mappingId/set-primary',
  hybridAuth,
  asyncHandler(async (req, res) => {
    const { mappingId } = req.params;
    const { workflowVersionId } = req.query;

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- query param validation
    if (!workflowVersionId || typeof workflowVersionId !== 'string') {
      throw createError.validation('workflowVersionId query parameter is required');
    }

    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) {throw createError.unauthorized(AUTH_REQUIRED);}
    const version = await db.query.workflowVersions.findFirst({
      where: eq(workflowVersions.id, workflowVersionId)
    });
    if (!version) {throw createError.notFound('Workflow version');}
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
workflowTemplateMappingsRouter.delete(
  '/workflow-templates/:mappingId',
  hybridAuth,
  asyncHandler(async (req, res) => {
    const { mappingId } = req.params;
    const { workflowVersionId } = req.query;

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- query param validation
    if (!workflowVersionId || typeof workflowVersionId !== 'string') {
      throw createError.validation('workflowVersionId query parameter is required');
    }

    // SECURITY FIX: Verify user has access to this workflow
    const userId = (req as AuthRequest).userId;
    if (!userId) {throw createError.unauthorized(AUTH_REQUIRED);}
    const version = await db.query.workflowVersions.findFirst({
      where: eq(workflowVersions.id, workflowVersionId)
    });
    if (!version) {throw createError.notFound('Workflow version');}
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
  app.use('/api/workflows', workflowVersionTemplatesRouter);
  app.use('/api', workflowTemplateMappingsRouter); // For /api/workflow-templates paths
}

export default workflowVersionTemplatesRouter;


