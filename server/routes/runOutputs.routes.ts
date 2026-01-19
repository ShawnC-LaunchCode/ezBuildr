/**
 * Stage 21: Run Outputs API Routes
 *
 * Endpoints for viewing and downloading generated documents
 */
import fs from 'fs/promises';
import path from 'path';
import { eq } from 'drizzle-orm';
import express from 'express';
import { runOutputs } from '@shared/schema';
import { db } from '../db';
import { asyncHandler } from '../middleware';
import { hybridAuth } from '../middleware/auth';
import { getOutputFilePath } from '../services/templates';
import { createError } from '../utils/errors';
import type { Express } from 'express';
const router = express.Router();
// All routes require authentication
router.use(hybridAuth);
/**
 * List all outputs for a run
 * GET /api/runs/:runId/outputs
 */
router.get(
  '/:runId/outputs',
  asyncHandler(async (req, res) => {
    const { runId } = req.params;
    const outputs = await db.query.runOutputs.findMany({
      where: eq(runOutputs.runId, runId),
      orderBy: (outputs: any, { asc }: any) => [asc(outputs.createdAt)],
    });
    res.json({
      success: true,
      data: outputs,
    });
  })
);
/**
 * Download an output file
 * GET /api/runs/:runId/outputs/:outputId/download
 */
router.get(
  '/:runId/outputs/:outputId/download',
  asyncHandler(async (req, res) => {
    const { runId, outputId } = req.params;
    // Fetch output
    const output = await db.query.runOutputs.findFirst({
      where: eq(runOutputs.id, outputId),
    });
    if (!output) {
      throw createError.notFound('Output');
    }
    if (output.runId !== runId) {
      throw createError.forbidden('Access denied');
    }
    if (output.status !== 'ready') {
      throw createError.validation(`Output is not ready (status: ${output.status})`);
    }
    if (!output.storagePath) {
      throw createError.internal('Output file path is missing');
    }
    // Get file path
    const filePath = getOutputFilePath(output.storagePath);
    // Verify file exists
    try {
      await fs.access(filePath);
    } catch {
      throw createError.notFound('Output file not found on disk');
    }
    // Get file stats
    const stats = await fs.stat(filePath);
    // Determine content type
    const ext = path.extname(output.storagePath).toLowerCase();
    const contentType =
      ext === '.pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${output.storagePath}"`);
    // Stream file
    const fileStream = await fs.readFile(filePath);
    res.send(fileStream);
  })
);
/**
 * Retry failed PDF conversion
 * POST /api/runs/:runId/outputs/:outputId/retry
 */
router.post(
  '/:runId/outputs/:outputId/retry',
  asyncHandler(async (req, res) => {
    const { runId, outputId } = req.params;
    // Fetch output
    const output = await db.query.runOutputs.findFirst({
      where: eq(runOutputs.id, outputId),
    });
    if (!output) {
      throw createError.notFound('Output');
    }
    if (output.runId !== runId) {
      throw createError.forbidden('Access denied');
    }
    if (output.fileType !== 'pdf') {
      throw createError.validation('Only PDF outputs can be retried');
    }
    if (output.status === 'ready') {
      throw createError.validation('Output is already ready');
    }
    // Reset status to pending
    await db
      .update(runOutputs)
      .set({
        status: 'pending',
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(runOutputs.id, outputId));
    res.json({
      success: true,
      message: 'PDF conversion retry queued',
    });
  })
);
/**
 * Register run outputs routes
 */
export function registerRunOutputsRoutes(app: Express): void {
  app.use('/api/runs', router);
}
export default router;