/**
 * Stage 21: Template Analysis API Routes
 *
 * Endpoints for analyzing and validating document templates
 */

import express from 'express';
import { z } from 'zod';

import { hybridAuth, asyncHandler } from '../middleware';
import { documentTemplateService } from '../services/DocumentTemplateService';
import {
  analyzeTemplate,
  validateTemplateWithData,
  generateSampleData,
  compareTemplates,
} from '../services/TemplateAnalysisService';
import { aclService } from '../services/AclService';
import type { Express } from 'express';

const router = express.Router();

// All routes require authentication
router.use(hybridAuth);

/**
 * Analyze template structure
 * GET /api/templates/:templateId/analyze?projectId=xxx
 */
router.get(
  '/:templateId/analyze',
  asyncHandler(async (req, res) => {
    const { templateId } = req.params;
    const { projectId } = req.query;

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!projectId || typeof projectId !== 'string') {
      throw createError.validation('projectId query parameter is required');
    }

    const userId = (req as any).user?.id || (req as any).userId;
    const hasAccess = await aclService.hasProjectRole(userId, projectId, 'view');
    if (!hasAccess) {
      throw createError.forbidden('Access denied to project');
    }

    // Verify template exists and user has access
    const template = await documentTemplateService.getTemplate(templateId, projectId);

    // Analyze template
    const analysis = await analyzeTemplate(template.fileRef);

    res.json({
      success: true,
      data: analysis,
    });
  })
);

/**
 * Validate template with sample data
 * POST /api/templates/:templateId/validate?projectId=xxx
 * Body: { sampleData: {...} }
 */
const validateSchema = z.object({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic sample data for template validation
  sampleData: z.record(z.any()),
});

router.post(
  '/:templateId/validate',
  asyncHandler(async (req, res) => {
    const { templateId } = req.params;
    const { projectId } = req.query;

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!projectId || typeof projectId !== 'string') {
      throw createError.validation('projectId query parameter is required');
    }

    const userId = (req as any).user?.id || (req as any).userId;
    const hasAccess = await aclService.hasProjectRole(userId, projectId, 'view');
    if (!hasAccess) {
      throw createError.forbidden('Access denied to project');
    }

    // Validate request body
    const body = validateSchema.parse(req.body);

    // Verify template exists and user has access
    const template = await documentTemplateService.getTemplate(templateId, projectId);

    // Validate template with data
    const validation = await validateTemplateWithData(template.fileRef, body.sampleData);

    res.json({
      success: true,
      data: validation,
    });
  })
);

/**
 * Generate sample data for template
 * POST /api/templates/:templateId/sample-data?projectId=xxx
 */
router.post(
  '/:templateId/sample-data',
  asyncHandler(async (req, res) => {
    const { templateId } = req.params;
    const { projectId } = req.query;

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!projectId || typeof projectId !== 'string') {
      throw createError.validation('projectId query parameter is required');
    }

    const userId = (req as any).user?.id || (req as any).userId;
    const hasAccess = await aclService.hasProjectRole(userId, projectId, 'view');
    if (!hasAccess) {
      throw createError.forbidden('Access denied to project');
    }

    // Verify template exists and user has access
    const template = await documentTemplateService.getTemplate(templateId, projectId);

    // Generate sample data
    const sampleData = await generateSampleData(template.fileRef);

    res.json({
      success: true,
      data: sampleData,
    });
  })
);

/**
 * Compare two templates
 * POST /api/templates/compare?projectId=xxx
 * Body: { templateId1: string, templateId2: string }
 */
const compareSchema = z.object({
  templateId1: z.string().uuid(),
  templateId2: z.string().uuid(),
});

router.post(
  '/compare',
  asyncHandler(async (req, res) => {
    const { projectId } = req.query;

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!projectId || typeof projectId !== 'string') {
      throw createError.validation('projectId query parameter is required');
    }

    const userId = (req as any).user?.id || (req as any).userId;
    const hasAccess = await aclService.hasProjectRole(userId, projectId, 'view');
    if (!hasAccess) {
      throw createError.forbidden('Access denied to project');
    }

    // Validate request body
    const body = compareSchema.parse(req.body);

    // Verify both templates exist and user has access
    const template1 = await documentTemplateService.getTemplate(body.templateId1, projectId);
    const template2 = await documentTemplateService.getTemplate(body.templateId2, projectId);

    // Compare templates
    const comparison = await compareTemplates(template1.fileRef, template2.fileRef);

    res.json({
      success: true,
      data: comparison,
    });
  })
);

/**
 * Register template analysis routes
 */
export function registerTemplateAnalysisRoutes(app: Express): void {
  app.use('/api/templates', router);
}

export default router;
