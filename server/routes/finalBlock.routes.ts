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

import { promises as fs } from 'fs';
import { classifyRouteError } from '../utils/routeErrors';
import path from 'path';

import { z } from 'zod';

import { createLogger } from '../logger.js';
import { hybridAuth, type AuthRequest } from '../middleware/auth.js';
import { creatorOrRunTokenAuth, type RunAuthRequest } from '../middleware/runTokenAuth.js';
import { strictLimiter } from '../middleware/rateLimiter.js';
import { documentTemplateRepository, stepRepository, stepValueRepository } from '../repositories/index.js';
import { finalBlockRenderer, createTemplateResolver } from '../services/document/FinalBlockRenderer.js';
import { runService } from '../services/RunService.js';
import { workflowService } from '../services/WorkflowService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createError } from '../utils/errors.js';

import type { FinalBlockConfig } from '../../shared/types/stepConfigs.js';
import type { Express, Response } from 'express';

const logger = createLogger({ module: 'finalBlock-routes' });

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const generateFinalDocumentsSchema = z.object({
  stepId: z.string().uuid(),
  toPdf: z.boolean().optional().default(false),
  pdfStrategy: z.enum(['puppeteer', 'libreoffice']).optional().default('puppeteer'),
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
  pdfStrategy: z.enum(['puppeteer', 'libreoffice']).optional().default('puppeteer'),
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
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post(
    '/api/runs/:runId/generate-final',
    strictLimiter,
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    creatorOrRunTokenAuth,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asyncHandler(async (req: any, res: Response) => {
      try {
        const runAuthReq = req as RunAuthRequest;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const { stepId, toPdf, pdfStrategy } = generateFinalDocumentsSchema.parse(req.body);

        logger.info({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          runId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          stepId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          toPdf,
          userId,
        }, 'Generating Final Block documents for run');

        // Step 1: Load run data
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const run = runAuth != null
          ? await runService.getRunWithValuesNoAuth(runId)
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          : await runService.getRun(runId, userId!);

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!run) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          throw createError.notFound('Run', runId);
        }

        // Step 2: Load workflow
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const workflow = await workflowService.verifyAccess(run.workflowId, userId ?? 'anon', 'view').catch(async () => {
          // If verifyAccess fails (e.g. anon with run token), we might need to fetch public workflow
          // preventing error if we are authorized via run token
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
          const w = await (workflowService as any)['workflowRepo'].findById(run.workflowId);
          // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-return
          if (w) { return w; }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          throw createError.notFound('Workflow', run.workflowId);
        });

        // Step 3: Load step and validate it's a Final Block
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const step = await stepRepository.findById(stepId);
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!step || step.type !== 'final') {
          throw createError.validation('Invalid step: must be a Final Block');
        }

        const finalBlockConfig = step.options as FinalBlockConfig;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!finalBlockConfig?.documents) {
          throw createError.validation('Final Block configuration missing or invalid');
        }

        // Step 4: Load step values for this run
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const stepValuesList = await stepValueRepository.findByRunId(runId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stepValues: Record<string, any> = {};
        stepValuesList.forEach(sv => {
          stepValues[sv.stepId] = sv.value;
        });

        // Step 5: Create template resolver
        const resolveTemplate = createTemplateResolver(async (documentId: string) => {
          const template = await documentTemplateRepository.findByIdAndProjectId(
            documentId,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-non-null-assertion
            workflow.projectId
          );
          if (!template) {
            throw createError.notFound('Template', documentId);
          }
          // Return the template object (containing fileRef), the resolver will handle path construction
          return template;
        });

        // Step 6: Generate documents
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result = await finalBlockRenderer.render({
          finalBlockConfig,
          stepValues, // Correct format now
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          workflowId: workflow.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          runId: run.id,
          resolveTemplate,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          toPdf,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          pdfStrategy,
        });

        logger.info({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          runId,
          generated: result.totalGenerated,
          skipped: result.skipped.length,
        }, 'Final Block documents generated successfully');

        // Step 7: Return response
        res.status(200).json({
          success: true,
          data: {
            documents: result.documents,
            archive: result.archive,
            skipped: result.skipped,
            failed: result.failed,
            totalGenerated: result.totalGenerated,
            isArchived: result.isArchived,
          },
        });
      } catch (error: unknown) {
        logger.error({
          error,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          runId: req.params.runId,
        }, 'Failed to generate Final Block documents');

        const __r = classifyRouteError(error, 'Document generation failed');
      res.status(__r.status).json({ success: false,
          error: __r.message, });
      }
    })
  );

  /**
   * POST /api/workflows/:workflowId/preview/generate-final
   * Generate Final Block documents from preview mode data
   *
   * Authentication: Required (workflow creator)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post(
    '/api/workflows/:workflowId/preview/generate-final',
    strictLimiter,
    hybridAuth,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asyncHandler(async (req: any, res: Response) => {
      try {
        const authReq = req as AuthRequest;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const { workflowId } = req.params;
        const userId = authReq.userId;

        if (!userId) {
          throw createError.unauthorized();
        }

        // Validate request body
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const {
          stepId,
          finalBlockConfig,
          stepValues,
          toPdf,
          pdfStrategy,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        } = previewGenerateSchema.parse(req.body);

        logger.info({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          workflowId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          stepId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          toPdf,
          userId,
        }, 'Generating Final Block documents in preview mode');

        // Step 1: Load workflow and verify access
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument
        const workflow = await workflowService.verifyAccess(workflowId, userId, 'view');

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
          pdfStrategy,
        });

        logger.info({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          workflowId: req.params.workflowId,
        }, 'Failed to generate preview Final Block documents');

        const __r = classifyRouteError(error, 'Document generation failed');
      res.status(__r.status).json({ success: false,
          error: __r.message, });
      }
    })
  );

  /**
   * GET /api/runs/:runId/final-documents/:filename/download
   * Download a specific Final Block document
   *
   * Authentication: Creator or run token
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.get(
    '/api/runs/:runId/final-documents/:filename/download',
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    creatorOrRunTokenAuth,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asyncHandler(async (req: any, res: Response) => {
      try {
        const runAuthReq = req as RunAuthRequest;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          runId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          filename,
          userId,
        }, 'Downloading Final Block document');

        // Verify run access
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const run = runAuth != null
          ? await runService.getRunWithValuesNoAuth(runId)
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          : await runService.getRun(runId, userId!);

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!run) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          throw createError.notFound('Run', runId);
        }

        // Sanitize filename to prevent path traversal
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const sanitizedFilename = path.basename(filename);

        // Security check: ensure the file belongs to this run
        // ZIP files are prefixed with final-docs-{runId.slice(0, 8)}
        // Individual files are prefixed with {runId}_
        if (!sanitizedFilename.includes(runId) && !sanitizedFilename.includes(`final-docs-${runId.slice(0, 8)}`)) {
          logger.warn({ runId, filename: sanitizedFilename }, 'Attempted to access file not belonging to run');
          throw createError.notFound('File', filename);
        }

        // Check in archives directory
        const archivesDir = path.join(process.cwd(), 'server', 'files', 'archives');
        const filePath = path.join(archivesDir, sanitizedFilename);

        // Verify file exists
        try {
          await fs.access(filePath);
        } catch {
          // Try outputs directory as fallback
          const outputsDir = path.join(process.cwd(), 'server', 'files', 'outputs');
          const fallbackPath = path.join(outputsDir, sanitizedFilename);

          try {
            await fs.access(fallbackPath);
            return res.sendFile(fallbackPath);
          } catch {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            throw createError.notFound('File', filename);
          }
        }

        // Send file
        res.sendFile(filePath);
      } catch (error: unknown) {
        logger.error({
          error,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          runId: req.params.runId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
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
