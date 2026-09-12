/**
 * Stage 21: Template Analysis API Routes
 *
 * Endpoints for analyzing and validating document templates
 */

import express, { type Express, type Request } from 'express';
import { z } from 'zod';

import { hybridAuth, asyncHandler } from '../middleware';
import { documentTemplateService } from '../services/DocumentTemplateService';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';

import {
  analyzeTemplate,
  validateTemplateWithData,
  generateSampleData,
  compareTemplates,
  analyzeTemplateUpdate,
} from '../services/TemplateAnalysisService';
import { aclService } from '../services/AclService';
import { createError } from '../utils/errors';
import type { AuthRequest } from '../middleware/auth';
import { withCurrentTenant } from "../utils/rlsContext";
import { rlsContext } from "../middleware/rlsContext";

const ACCESS_DENIED_ERROR = 'Access denied to project';
const router = express.Router();

interface RequestWithOptionalUser extends AuthRequest {
  user?: {
    id?: string;
  };
}

function requireProjectId(req: Request): string {
  const { projectId } = req.query;
  if (typeof projectId !== 'string' || projectId === '') {
    throw createError.validation('projectId query parameter is required');
  }
  return projectId;
}

function requireAuthenticatedUserId(req: Request): string {
  const authReq = req as RequestWithOptionalUser;
  const userId = authReq.user?.id ?? authReq.userId;
  if (userId === undefined || userId === '') {
    throw createError.unauthorized();
  }
  return userId;
}

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
    const projectId = requireProjectId(req);

    const userId = requireAuthenticatedUserId(req);
    const hasAccess = await withCurrentTenant((aclTx) => aclService.hasProjectRole(userId, projectId, 'view', aclTx));
    if (!hasAccess) {
      throw createError.forbidden(ACCESS_DENIED_ERROR);
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

  sampleData: z.record(z.any()),
});

router.post(
  '/:templateId/validate',
  asyncHandler(async (req, res) => {
    const { templateId } = req.params;
    const projectId = requireProjectId(req);

    const userId = requireAuthenticatedUserId(req);
    const hasAccess = await withCurrentTenant((aclTx) => aclService.hasProjectRole(userId, projectId, 'view', aclTx));
    if (!hasAccess) {
      throw createError.forbidden(ACCESS_DENIED_ERROR);
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
    const projectId = requireProjectId(req);

    const userId = requireAuthenticatedUserId(req);
    const hasAccess = await withCurrentTenant((aclTx) => aclService.hasProjectRole(userId, projectId, 'view', aclTx));
    if (!hasAccess) {
      throw createError.forbidden(ACCESS_DENIED_ERROR);
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
    const projectId = requireProjectId(req);

    const userId = requireAuthenticatedUserId(req);
    const hasAccess = await withCurrentTenant((aclTx) => aclService.hasProjectRole(userId, projectId, 'view', aclTx));
    if (!hasAccess) {
      throw createError.forbidden(ACCESS_DENIED_ERROR);
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

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
});

/**
 * Analyze an impending template update for impact
 * POST /api/templates/:templateId/analyze-update?projectId=xxx
 */
router.post(
  '/:templateId/analyze-update',
  upload.single('file'),
  // RLS-5: re-open the tenant async context after multer. Multer resumes the
  // chain from a stream callback, outside the store the app-level `rlsContext`
  // opened, so every `withCurrentTenant` downstream runs unscoped. See the
  // full explanation on the templates upload route.
  rlsContext,
  asyncHandler(async (req, res) => {
    const { templateId } = req.params;
    const projectId = requireProjectId(req);

    const userId = requireAuthenticatedUserId(req);
    const hasAccess = await withCurrentTenant((aclTx) => aclService.hasProjectRole(userId, projectId, 'edit', aclTx));
    if (!hasAccess) {
      if (req.file) {await fs.unlink(req.file.path).catch(() => {});}
      throw createError.forbidden(ACCESS_DENIED_ERROR);
    }

    if (!req.file) {
      throw createError.validation('File upload required');
    }

    try {
      // Verify template exists and user has access
      await documentTemplateService.getTemplate(templateId, projectId);

      // Pass the temporary uploaded file path for analysis
      const analysis = await analyzeTemplateUpdate(templateId, req.file.path);

      res.json({
        success: true,
        data: analysis,
      });
    } finally {
      // Clean up the temporary file
      await fs.unlink(req.file.path).catch(() => {});
    }
  })
);

/**
 * Register template analysis routes
 */
export function registerTemplateAnalysisRoutes(app: Express): void {
  app.use('/api/templates', router);
}

export default router;
