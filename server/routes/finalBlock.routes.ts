/**
 * Final Block Document Generation Routes
 *
 * API endpoints for generating documents from Final Blocks.
 * Supports both authenticated (preview mode, real runs) and token-based access.
 *
 * Endpoints:
 * - POST /api/runs/:runId/generate-final - Generate documents for completed run
 * - POST /api/workflows/:workflowId/preview/generate-final - Generate from preview data
 * - GET /api/runs/:runId/final-documents - List generated documents
 * - GET /api/runs/:runId/final-documents/download - Download ZIP or single file
 *
 * @version 1.0.0 - Final Block Extension (Prompt 10)
 * @date December 6, 2025
 */

import { classifyRouteError } from '../utils/routeErrors';
import path from 'path';

import { z } from 'zod';

import { createLogger } from '../logger.js';
import { hybridAuth, type AuthRequest } from '../middleware/auth.js';
import { creatorOrRunTokenAuth, type RunAuthRequest } from '../middleware/runTokenAuth.js';
import { strictLimiter } from '../middleware/rateLimiter.js';
import { documentTemplateRepository, runGeneratedDocumentsRepository } from '../repositories/index.js';
import { finalBlockRenderer, createTemplateResolver } from '../services/document/FinalBlockRenderer.js';
import { getListConfigsByAlias } from '../services/document/VariableNormalizer.js';
import { runService } from '../services/RunService.js';
import { storageProvider } from '../services/storage/index.js';
import { stepService } from '../services/StepService.js';
import { workflowService } from '../services/WorkflowService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createError } from '../utils/errors.js';

import type { Express, Request, Response } from 'express';

const logger = createLogger({ module: 'finalBlock-routes' });

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const generateFinalDocumentsSchema = z.object({
  stepId: z.string().uuid(),
  toPdf: z.boolean().optional().default(false),
});

const previewGenerateSchema = z.object({
  stepId: z.string().uuid(),
  finalBlockConfig: z.object({
    markdownHeader: z.string(),
    documents: z.array(
      z.object({
        id: z.string(),
        documentId: z.string(),
        alias: z.string(),
        conditions: z.any().optional().nullable(),
        mapping: z.record(z.any()).optional(),
      })
    ),
  }),
  stepValues: z.record(z.any()),
  toPdf: z.boolean().optional().default(false),
});

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

/**
 * Register Final Block document generation routes
 */
export function registerFinalBlockRoutes(app: Express): void {
  /**
   * POST /api/runs/:runId/generate-final
   * Generate Final Block documents for a completed run
   *
   * Authentication: Creator or run token
   */

  app.post(
    '/api/runs/:runId/generate-final',
    strictLimiter,

    creatorOrRunTokenAuth,

    asyncHandler(async (req: Request, res: Response) => {
      try {
        const runAuthReq = req as RunAuthRequest;

        const { runId } = req.params;
        const userId = (req as AuthRequest).userId;
        const runAuth = runAuthReq.runAuth;

        if (runAuth != null) {
          if (runAuth.runId !== runId) {
            res.status(403).json({ success: false, error: "Access denied - run mismatch" });
            return;
          }
        } else if (!userId) {
          res.status(401).json({ success: false, error: "Unauthorized - no user ID found" });
          return;
        }

        // Validate request body

        const { stepId, toPdf } = generateFinalDocumentsSchema.parse(req.body);

        logger.info({

          runId,

          stepId,

          toPdf,
          userId,
        }, 'Generating Final Block documents for run');

        // Step 1: Verify run access

        const run = runAuth != null
          ? await runService.getRunWithValuesNoAuth(runId)

          : await runService.getRun(runId, userId!);

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!run) {

          throw createError.notFound('Run', runId);
        }

        // Step 2: Generate documents through the shared run pipeline.
        const result = await runService.generateDocuments(run.id, {
          finalStepId: stepId,
          toPdf,
        });

        logger.info({

          runId,
          generated: result.documentsGenerated,
          skipped: result.skipped?.length ?? 0,
        }, 'Final Block documents generated successfully');

        // Step 3: Return response
        res.status(200).json({
          success: true,
          data: {
            documents: result.documents ?? [],
            archive: result.archive,
            skipped: result.skipped ?? [],
            failed: result.failed ?? [],
            totalGenerated: result.documentsGenerated,
            isArchived: result.isArchived,
          },
        });
      } catch (error: unknown) {
        logger.error({
          error,

          runId: req.params.runId,
        }, 'Failed to generate Final Block documents');

        const { status, message } = classifyRouteError(error, 'Document generation failed');
      res.status(status).json({ success: false, error: message });
      }
    })
  );

  /**
   * POST /api/workflows/:workflowId/preview/generate-final
   * Generate Final Block documents from preview mode data
   *
   * Authentication: Required (workflow creator)
   */

  app.post(
    '/api/workflows/:workflowId/preview/generate-final',
    strictLimiter,
    hybridAuth,

    asyncHandler(async (req: Request, res: Response) => {
      try {
        const authReq = req as AuthRequest;

        const { workflowId } = req.params;
        const userId = authReq.userId;

        if (!userId) {
          throw createError.unauthorized();
        }

        // Validate request body

        const {
          stepId,
          finalBlockConfig,
          stepValues,
          toPdf,

        } = previewGenerateSchema.parse(req.body);

        logger.info({

          workflowId,

          stepId,

          toPdf,
          userId,
        }, 'Generating Final Block documents in preview mode');

        // Step 1: Load workflow and verify access

        const workflow = await workflowService.verifyAccess(workflowId, userId, 'view');
        const workflowSteps = await stepService.getWorkflowSteps(workflowId);

        // Step 2: Create template resolver
        const resolveTemplate = createTemplateResolver(async (documentId: string) => {
          const template = await documentTemplateRepository.findByIdAndProjectId(
            documentId,
            workflow.projectId!
          );
          if (!template) {
            throw createError.notFound('Template', documentId);
          }
          return template;
        });

        // Step 3: Generate documents
        const result = await finalBlockRenderer.render({
          finalBlockConfig,
          stepValues,
          workflowId: workflow.id,
          runId: `preview-${Date.now()}`, // Temporary run ID for preview
          resolveTemplate,
          toPdf,
          normalizationOptions: {
            listConfigs: getListConfigsByAlias(workflowSteps),
          },
        });

        logger.info({

          workflowId,
          generated: result.totalGenerated,
        }, 'Preview Final Block documents generated successfully');

        // Step 4: Return response
        res.status(200).json({
          success: true,
          data: {
            documents: result.documents,
            archive: result.archive,
            skipped: result.skipped,
            failed: result.failed,
            totalGenerated: result.totalGenerated,
            isArchived: result.isArchived,
            preview: true,
          },
        });
      } catch (error: unknown) {
        logger.error({
          error,

          workflowId: req.params.workflowId,
        }, 'Failed to generate preview Final Block documents');

        const { status, message } = classifyRouteError(error, 'Document generation failed');
      res.status(status).json({ success: false, error: message });
      }
    })
  );

  /**
   * GET /api/runs/:runId/final-documents/:filename/download
   * Download a specific Final Block document
   *
   * Authentication: Creator or run token
   */

  app.get(
    '/api/runs/:runId/final-documents/:filename/download',

    creatorOrRunTokenAuth,

    asyncHandler(async (req: Request, res: Response) => {
      try {
        const runAuthReq = req as RunAuthRequest;

        const { runId, filename } = req.params;
        const userId = (req as AuthRequest).userId;
        const runAuth = runAuthReq.runAuth;

        if (runAuth != null) {
          if (runAuth.runId !== runId) {
            res.status(403).json({ success: false, error: "Access denied - run mismatch" });
            return;
          }
        } else if (!userId) {
          res.status(401).json({ success: false, error: "Unauthorized - no user ID found" });
          return;
        }

        logger.info({

          runId,

          filename,
          userId,
        }, 'Downloading Final Block document');

        // Verify run access

        const run = runAuth != null
          ? await runService.getRunWithValuesNoAuth(runId)

          : await runService.getRun(runId, userId!);

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!run) {

          throw createError.notFound('Run', runId);
        }

        // Sanitize filename to prevent path traversal

        const sanitizedFilename = path.basename(filename);

        // Look up storageKey from DB
        const docs = await runGeneratedDocumentsRepository.findByRunId(runId);
        const docRecord = docs.find(d => d.fileName === sanitizedFilename);

        if (!docRecord?.storageKey) {
          logger.warn({ runId, filename: sanitizedFilename }, 'File record not found or lacks storageKey');
          throw createError.notFound('File', filename);
        }

        // Retrieve file from storageProvider
        const fileBuffer = await storageProvider.getFile(docRecord.storageKey);

        // Send file
        res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
        res.setHeader('Content-Type', docRecord.mimeType ?? 'application/octet-stream');
        res.setHeader('Content-Length', fileBuffer.length.toString());
        res.send(fileBuffer);
      } catch (error: unknown) {
        logger.error({
          error,

          runId: req.params.runId,

          filename: req.params.filename,
        }, 'Failed to download Final Block document');

        res.status(500).json({
          success: false,
          error: 'Download failed',
        });
      }
    })
  );
}

export default {
  registerFinalBlockRoutes,
};

