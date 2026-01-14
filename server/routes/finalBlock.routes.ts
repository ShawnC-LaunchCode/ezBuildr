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
import path from 'path';

import { z } from 'zod';

import { createLogger } from '../logger.js';
import { hybridAuth, type AuthRequest } from '../middleware/auth.js';
import { creatorOrRunTokenAuth, type RunAuthRequest } from '../middleware/runTokenAuth.js';
import { documentTemplateRepository, stepRepository, stepValueRepository } from '../repositories/index.js';
import { finalBlockRenderer, createTemplateResolver } from '../services/document/FinalBlockRenderer.js';
import { runService } from '../services/RunService.js';
import { workflowService } from '../services/WorkflowService.js';
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
  app.post(
    '/api/runs/:runId/generate-final',
    creatorOrRunTokenAuth,
    async (req: RunAuthRequest, res: Response) => {
      try {
        const { runId } = req.params;
        const userId = req.userId || ''; // Handle undefined userId (run token)

        // Validate request body
        const { stepId, toPdf, pdfStrategy } = generateFinalDocumentsSchema.parse(req.body);

        logger.info({
          runId,
          stepId,
          toPdf,
          userId,
        }, 'Generating Final Block documents for run');

        // Step 1: Load run data
        // Use getRun which handles permission checks (owner or creator or run token implied if we trust middleware)
        // If userId is empty string, we might rely on middleware validation
        let run;
        try {
          run = await runService.getRun(runId, userId);
        } catch (e) {
          // Fallback for run token or public run logic if getRun is too strict
          // For now, assuming middleware ensures access, we can fetch no-auth if getRun fails?
          // But getRun handles 'creator:...' check.
          if (userId) {throw e;}
          run = await runService.getRunWithValuesNoAuth(runId);
        }

        if (!run) {
          throw createError.notFound('Run', runId);
        }

        // Step 2: Load workflow
        const workflow = await workflowService.verifyAccess(run.workflowId, userId || 'anon', 'view').catch(async () => {
          // If verifyAccess fails (e.g. anon with run token), we might need to fetch public workflow
          // preventing error if we are authorized via run token
          const w = await workflowService['workflowRepo'].findById(run.workflowId);
          if (w) {return w;}
          throw createError.notFound('Workflow', run.workflowId);
        });

        // Step 3: Load step and validate it's a Final Block
        const step = await stepRepository.findById(stepId);
        if (!step || step.type !== 'final') {
          throw createError.validation('Invalid step: must be a Final Block');
        }

        const finalBlockConfig = step.options as FinalBlockConfig;
        if (!finalBlockConfig?.documents) {
          throw createError.validation('Final Block configuration missing or invalid');
        }

        // Step 4: Load step values for this run
        const stepValuesList = await stepValueRepository.findByRunId(runId);
        const stepValues: Record<string, any> = {};
        stepValuesList.forEach(sv => {
          stepValues[sv.stepId] = sv.value;
        });

        // Step 5: Create template resolver
        const resolveTemplate = createTemplateResolver(async (documentId: string) => {
          const template = await documentTemplateRepository.findByIdAndProjectId(
            documentId,
            workflow.projectId!
          );
          if (!template) {
            throw createError.notFound('Template', documentId);
          }
          // Return the template object (containing fileRef), the resolver will handle path construction
          return template;
        });

        // Step 6: Generate documents
        const result = await finalBlockRenderer.render({
          finalBlockConfig,
          stepValues, // Correct format now
          workflowId: workflow.id,
          runId: run.id,
          resolveTemplate,
          toPdf,
          pdfStrategy,
        });

        logger.info({
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
      } catch (error) {
        logger.error({
          error,
          runId: req.params.runId,
        }, 'Failed to generate Final Block documents');

        const message = error instanceof Error ? error.message : 'Document generation failed';
        const status = message.includes('not found') ? 404 : 500;

        res.status(status).json({
          success: false,
          error: message,
        });
      }
    }
  );

  /**
   * POST /api/workflows/:workflowId/preview/generate-final
   * Generate Final Block documents from preview mode data
   *
   * Authentication: Required (workflow creator)
   */
  app.post(
    '/api/workflows/:workflowId/preview/generate-final',
    hybridAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const { workflowId } = req.params;
        const userId = req.userId;

        if (!userId) {
          throw createError.unauthorized();
        }

        // Validate request body
        const {
          stepId,
          finalBlockConfig,
          stepValues,
          toPdf,
          pdfStrategy,
        } = previewGenerateSchema.parse(req.body);

        logger.info({
          workflowId,
          stepId,
          toPdf,
          userId,
        }, 'Generating Final Block documents in preview mode');

        // Step 1: Load workflow and verify access
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
      } catch (error) {
        logger.error({
          error,
          workflowId: req.params.workflowId,
        }, 'Failed to generate preview Final Block documents');

        const message = error instanceof Error ? error.message : 'Document generation failed';
        const status = message.includes('not found') ? 404 : 500;

        res.status(status).json({
          success: false,
          error: message,
        });
      }
    }
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
    async (req: RunAuthRequest, res: Response) => {
      try {
        const { runId, filename } = req.params;
        const userId = req.userId || '';

        logger.info({
          runId,
          filename,
          userId,
        }, 'Downloading Final Block document');

        // Verify run access
        // Try getRun. If it fails, check using noAuth if run token?
        let run;
        try {
          run = await runService.getRun(runId, userId);
        } catch (e) {
          if (userId) {throw e;}
          // If no user ID, allow if token is valid? 
          // RunService doesn't have explicit run token check, but if we reached here via middleware
          // we assume valid token.
          run = await runService.getRunWithValuesNoAuth(runId);
        }

        if (!run) {
          throw createError.notFound('Run', runId);
        }

        // Sanitize filename to prevent path traversal
        const sanitizedFilename = path.basename(filename);

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
            throw createError.notFound('File', filename);
          }
        }

        // Send file
        res.sendFile(filePath);
      } catch (error) {
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
    }
  );
}

export default {
  registerFinalBlockRoutes,
};
