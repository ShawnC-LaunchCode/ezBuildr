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

import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import path from 'path';
import { promises as fs } from 'fs';
import { hybridAuth, type AuthRequest } from '../middleware/auth.js';
import { creatorOrRunTokenAuth, type RunAuthRequest } from '../middleware/runTokenAuth.js';
import { finalBlockRenderer, createTemplateResolver } from '../services/document/FinalBlockRenderer.js';
import { runService } from '../services/RunService.js';
import { workflowService } from '../services/WorkflowService.js';
import { documentTemplateRepository } from '../repositories/DocumentTemplateRepository.js';
import type { FinalBlockConfig } from '../../shared/types/stepConfigs.js';
import { createLogger } from '../logger.js';
import { createError } from '../utils/errors.js';

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
   * Body: {
   *   stepId: string;          // Final block step ID
   *   toPdf?: boolean;         // Convert to PDF (default: false)
   *   pdfStrategy?: string;    // PDF strategy (default: 'puppeteer')
   * }
   */
  app.post(
    '/api/runs/:runId/generate-final',
    creatorOrRunTokenAuth,
    async (req: RunAuthRequest, res: Response) => {
      try {
        const { runId } = req.params;
        const userId = req.userId;

        // Validate request body
        const { stepId, toPdf, pdfStrategy } = generateFinalDocumentsSchema.parse(req.body);

        logger.info('Generating Final Block documents for run', {
          runId,
          stepId,
          toPdf,
          userId,
        });

        // Step 1: Load run data
        const run = await runService.getRun(runId, userId);
        if (!run) {
          return res.status(404).json({
            success: false,
            error: 'Run not found',
          });
        }

        // Step 2: Load workflow and find Final Block step
        const workflow = await workflowService.getWorkflowById(run.workflowId, userId);
        if (!workflow) {
          return res.status(404).json({
            success: false,
            error: 'Workflow not found',
          });
        }

        // Step 3: Load step and validate it's a Final Block
        const step = await workflowService.getStepById(stepId);
        if (!step || step.type !== 'final') {
          return res.status(400).json({
            success: false,
            error: 'Invalid step: must be a Final Block',
          });
        }

        const finalBlockConfig = step.config as FinalBlockConfig;
        if (!finalBlockConfig || !finalBlockConfig.documents) {
          return res.status(400).json({
            success: false,
            error: 'Final Block configuration missing or invalid',
          });
        }

        // Step 4: Load step values for this run
        const stepValues = await runService.getStepValuesForRun(runId);

        // Step 5: Create template resolver
        const resolveTemplate = createTemplateResolver(async (documentId: string) => {
          const template = await documentTemplateRepository.getTemplateById(
            documentId,
            workflow.projectId
          );
          if (!template) {
            throw createError('TEMPLATE_NOT_FOUND', `Template not found: ${documentId}`);
          }
          return path.join(process.cwd(), 'server', 'files', template.fileRef);
        });

        // Step 6: Generate documents
        const result = await finalBlockRenderer.render({
          finalBlockConfig,
          stepValues,
          workflowId: workflow.id,
          runId: run.id,
          resolveTemplate,
          toPdf,
          pdfStrategy,
        });

        logger.info('Final Block documents generated successfully', {
          runId,
          generated: result.totalGenerated,
          skipped: result.skipped.length,
        });

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
        logger.error('Failed to generate Final Block documents', {
          error,
          runId: req.params.runId,
        });

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
   * Body: {
   *   stepId: string;
   *   finalBlockConfig: FinalBlockConfig;
   *   stepValues: Record<string, any>;
   *   toPdf?: boolean;
   *   pdfStrategy?: string;
   * }
   */
  app.post(
    '/api/workflows/:workflowId/preview/generate-final',
    hybridAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const { workflowId } = req.params;
        const userId = req.userId;

        if (!userId) {
          return res.status(401).json({
            success: false,
            error: 'Unauthorized',
          });
        }

        // Validate request body
        const {
          stepId,
          finalBlockConfig,
          stepValues,
          toPdf,
          pdfStrategy,
        } = previewGenerateSchema.parse(req.body);

        logger.info('Generating Final Block documents in preview mode', {
          workflowId,
          stepId,
          toPdf,
          userId,
        });

        // Step 1: Load workflow and verify access
        const workflow = await workflowService.getWorkflowById(workflowId, userId);
        if (!workflow) {
          return res.status(404).json({
            success: false,
            error: 'Workflow not found',
          });
        }

        // Step 2: Create template resolver
        const resolveTemplate = createTemplateResolver(async (documentId: string) => {
          const template = await documentTemplateRepository.getTemplateById(
            documentId,
            workflow.projectId
          );
          if (!template) {
            throw createError('TEMPLATE_NOT_FOUND', `Template not found: ${documentId}`);
          }
          return path.join(process.cwd(), 'server', 'files', template.fileRef);
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

        logger.info('Preview Final Block documents generated successfully', {
          workflowId,
          generated: result.totalGenerated,
        });

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
        logger.error('Failed to generate preview Final Block documents', {
          error,
          workflowId: req.params.workflowId,
        });

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
        const userId = req.userId;

        logger.info('Downloading Final Block document', {
          runId,
          filename,
          userId,
        });

        // Verify run access
        const run = await runService.getRun(runId, userId);
        if (!run) {
          return res.status(404).json({
            success: false,
            error: 'Run not found',
          });
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
            return res.status(404).json({
              success: false,
              error: 'File not found',
            });
          }
        }

        // Send file
        res.sendFile(filePath);
      } catch (error) {
        logger.error('Failed to download Final Block document', {
          error,
          runId: req.params.runId,
          filename: req.params.filename,
        });

        res.status(500).json({
          success: false,
          error: 'Download failed',
        });
      }
    }
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  registerFinalBlockRoutes,
};
