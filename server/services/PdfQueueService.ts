/**
 * Stage 21: PDF Conversion Queue Service
 *
 * Queue-based PDF conversion with retry logic and status tracking.
 * Features:
 * - Background job processing
 * - Exponential backoff retry (3 attempts max)
 * - Status tracking in runOutputs table
 * - Error logging and recovery
 * - Graceful shutdown
 */

import { db } from '../db';
import { runOutputs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { convertDocxToPdf2 } from './docxRenderer2';
import { getOutputFilePath } from './templates';
import fs from 'fs/promises';
import path from 'path';
import type { DbTransaction } from '../repositories/BaseRepository';

export interface PdfConversionJob {
  id: string;                   // runOutput.id
  runId: string;
  workflowVersionId: string;
  templateKey: string;
  docxPath: string;              // Full path to DOCX file
  attempt: number;               // Current attempt (1-indexed)
  maxAttempts: number;           // Maximum retry attempts (default: 3)
  createdAt: Date;
}

export interface PdfConversionResult {
  success: boolean;
  pdfPath?: string;
  error?: string;
  attemptsMade: number;
}

/**
 * PDF Queue Service
 * Manages background PDF conversion queue
 */
export class PdfQueueService {
  private isRunning = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
  private readonly MAX_RETRIES = 3;
  private readonly BACKOFF_BASE_MS = 1000; // 1 second base

  /**
   * Start the background queue processor
   */
  start(): void {
    if (this.isRunning) {
      console.warn('PDF queue processor is already running');
      return;
    }

    this.isRunning = true;
    console.log('PDF queue processor started');

    // Start polling for pending jobs
    this.pollingInterval = setInterval(() => {
      this.processQueue().catch((error) => {
        console.error('Error processing PDF queue:', error);
      });
    }, this.POLL_INTERVAL_MS);

    // Process immediately on start
    this.processQueue().catch((error) => {
      console.error('Error processing PDF queue on start:', error);
    });
  }

  /**
   * Stop the background queue processor
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    console.log('PDF queue processor stopped');
  }

  /**
   * Enqueue a DOCX file for PDF conversion
   *
   * @param docxPath - Path to DOCX file (relative to outputs dir)
   * @param runId - Run ID
   * @param workflowVersionId - Workflow version ID
   * @param templateKey - Template key
   * @returns Output ID
   */
  async enqueue(
    docxPath: string,
    runId: string,
    workflowVersionId: string,
    templateKey: string,
    tx?: DbTransaction
  ): Promise<string> {
    const database = tx || db;

    // Create pending PDF output entry
    const [output] = await database
      .insert(runOutputs)
      .values({
        runId,
        workflowVersionId,
        templateKey,
        fileType: 'pdf',
        storagePath: '', // Will be set after conversion
        status: 'pending',
      })
      .returning();

    console.log(`Enqueued PDF conversion job: ${output.id} (docx: ${docxPath})`);

    return output.id;
  }

  /**
   * Process pending PDF conversion jobs
   */
  private async processQueue(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Find all pending PDF outputs
      const pendingOutputs = await db.query.runOutputs.findMany({
        where: and(
          eq(runOutputs.fileType, 'pdf'),
          eq(runOutputs.status, 'pending')
        ),
        orderBy: (outputs, { asc }) => [asc(outputs.createdAt)],
        limit: 10, // Process up to 10 jobs per batch
      });

      if (pendingOutputs.length === 0) {
        return;
      }

      console.log(`Processing ${pendingOutputs.length} pending PDF conversion jobs`);

      // Process each job
      for (const output of pendingOutputs) {
        await this.processJob(output);
      }
    } catch (error) {
      console.error('Error in processQueue:', error);
    }
  }

  /**
   * Process a single PDF conversion job
   */
  private async processJob(output: any): Promise<void> {
    const attempt = (output.error ? JSON.parse(output.error || '{}').attempt || 0 : 0) + 1;
    const jobId = output.id;

    console.log(`Processing PDF job ${jobId} (attempt ${attempt}/${this.MAX_RETRIES})`);

    try {
      // Find corresponding DOCX output
      const docxOutput = await db.query.runOutputs.findFirst({
        where: and(
          eq(runOutputs.runId, output.runId),
          eq(runOutputs.templateKey, output.templateKey),
          eq(runOutputs.fileType, 'docx')
        ),
      });

      if (!docxOutput) {
        throw new Error(`DOCX output not found for template key: ${output.templateKey}`);
      }

      if (!docxOutput.storagePath) {
        throw new Error(`DOCX storagePath is empty`);
      }

      // Get full path to DOCX file
      const docxPath = getOutputFilePath(docxOutput.storagePath);

      // Verify DOCX file exists
      await fs.access(docxPath);

      // Convert DOCX to PDF
      const pdfPath = await convertDocxToPdf2(docxPath);

      // Verify PDF was created
      await fs.access(pdfPath);

      // Extract just the filename for storagePath
      const pdfFilename = path.basename(pdfPath);

      // Update output status to ready
      await db
        .update(runOutputs)
        .set({
          storagePath: pdfFilename,
          status: 'ready',
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(runOutputs.id, output.id));

      console.log(`✓ PDF job ${jobId} completed successfully: ${pdfFilename}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`✗ PDF job ${jobId} failed (attempt ${attempt}):`, errorMessage);

      // Determine if we should retry
      if (attempt < this.MAX_RETRIES) {
        // Calculate backoff delay
        const backoffMs = this.BACKOFF_BASE_MS * Math.pow(2, attempt - 1);

        console.log(`Will retry PDF job ${jobId} in ${backoffMs}ms`);

        // Update error with attempt count and backoff info
        await db
          .update(runOutputs)
          .set({
            error: JSON.stringify({
              message: errorMessage,
              attempt,
              nextRetryAt: new Date(Date.now() + backoffMs).toISOString(),
            }),
            updatedAt: new Date(),
          })
          .where(eq(runOutputs.id, output.id));

        // Schedule retry (simple setTimeout for now, could use proper job queue)
        setTimeout(() => {
          this.processJob(output).catch((err) => {
            console.error(`Error retrying PDF job ${jobId}:`, err);
          });
        }, backoffMs);
      } else {
        // Max retries exceeded, mark as failed
        await db
          .update(runOutputs)
          .set({
            status: 'failed',
            error: JSON.stringify({
              message: errorMessage,
              attempt,
              maxRetriesExceeded: true,
            }),
            updatedAt: new Date(),
          })
          .where(eq(runOutputs.id, output.id));

        console.error(`✗ PDF job ${jobId} FAILED after ${attempt} attempts`);
      }
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(outputId: string): Promise<{
    status: 'pending' | 'ready' | 'failed';
    storagePath?: string;
    error?: string;
    attempt?: number;
  } | null> {
    const output = await db.query.runOutputs.findFirst({
      where: eq(runOutputs.id, outputId),
    });

    if (!output) {
      return null;
    }

    let attempt: number | undefined;
    if (output.error) {
      try {
        const errorData = JSON.parse(output.error);
        attempt = errorData.attempt;
      } catch {
        // Ignore parse errors
      }
    }

    return {
      status: output.status,
      storagePath: output.storagePath || undefined,
      error: output.error || undefined,
      attempt,
    };
  }

  /**
   * Convert DOCX to PDF immediately (synchronous, no queue)
   * Use this for immediate conversions when queue is not needed
   */
  async convertImmediate(
    docxPath: string,
    runId: string,
    workflowVersionId: string,
    templateKey: string,
    tx?: DbTransaction
  ): Promise<PdfConversionResult> {
    const database = tx || db;

    try {
      // Convert DOCX to PDF
      const pdfPath = await convertDocxToPdf2(docxPath);

      // Verify PDF was created
      await fs.access(pdfPath);

      // Extract just the filename
      const pdfFilename = path.basename(pdfPath);

      // Store output
      await database.insert(runOutputs).values({
        runId,
        workflowVersionId,
        templateKey,
        fileType: 'pdf',
        storagePath: pdfFilename,
        status: 'ready',
      });

      return {
        success: true,
        pdfPath: pdfFilename,
        attemptsMade: 1,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Store failed output
      await database.insert(runOutputs).values({
        runId,
        workflowVersionId,
        templateKey,
        fileType: 'pdf',
        storagePath: '',
        status: 'failed',
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        attemptsMade: 1,
      };
    }
  }
}

// Singleton instance
export const pdfQueueService = new PdfQueueService();

// Auto-start in non-test environments
if (process.env.NODE_ENV !== 'test') {
  pdfQueueService.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, stopping PDF queue processor');
    pdfQueueService.stop();
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, stopping PDF queue processor');
    pdfQueueService.stop();
  });
}
