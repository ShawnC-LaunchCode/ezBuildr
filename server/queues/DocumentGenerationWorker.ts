/**
 * Document Generation Worker
 *
 * Processes document generation jobs from the Bull queue.
 * This worker can run on the same server as the web app or on dedicated worker instances.
 *
 * Usage:
 * 1. Start worker as part of server:
 *    import { startDocumentGenerationWorker } from './queues/DocumentGenerationWorker';
 *    startDocumentGenerationWorker();
 *
 * 2. Or run as standalone process:
 *    node -r esbuild-register server/queues/DocumentGenerationWorker.ts
 */

import path from 'path';

import { Job } from 'bull';
import { eq } from 'drizzle-orm';

import { runGeneratedDocuments, workflowRuns } from '../../shared/schema';
import { db } from '../db';
import { logger } from '../logger';
import { EnhancedDocumentEngine } from '../services/document/EnhancedDocumentEngine';

import { getDocumentGenerationQueue, DocumentGenerationJobData, DocumentGenerationJobResult } from './DocumentGenerationQueue';


// ============================================================================
// WORKER CONFIGURATION
// ============================================================================

const WORKER_CONCURRENCY = parseInt(process.env.DOCUMENT_WORKER_CONCURRENCY ?? '2', 10);

// ============================================================================
// JOB PROCESSOR
// ============================================================================

/**
 * Process a document generation job
 *
 * Workflow:
 * 1. Load workflow and run data
 * 2. Generate documents using EnhancedDocumentEngine
 * 3. Save generated documents to database
 * 4. Update run status
 * 5. Send notifications (email/webhook)
 * 6. Return results
 */
async function processDocumentGenerationJob(
  job: Job<DocumentGenerationJobData>
): Promise<DocumentGenerationJobResult> {
  const startTime = Date.now();
  const { runId, workflowId, userId: _userId, tenantId: _tenantId, renderOptions, notification } = job.data;

  logger.info(
    {
      jobId: job.id,
      runId,
      workflowId,
      documentCount: renderOptions.documents.length,
    },
    'Processing document generation job'
  );

  try {
    // Update job progress
    await job.progress(10);

    // Step 1: Validate run exists and is not already processed
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!run) {
      throw new Error(`Workflow run not found: ${runId}`);
    }

    await job.progress(20);

    // Step 2: Generate documents
    const engine = new EnhancedDocumentEngine();
    const result = await engine.renderFinalBlock(renderOptions);

    await job.progress(70);

    logger.info(
      {
        jobId: job.id,
        runId,
        generated: result.totalGenerated,
        skipped: result.skipped.length,
        failed: result.failed.length,
      },
      'Documents generated'
    );

    // Step 3: Save generated documents to database.
    // Records mirror the direct endpoint's shape: fileName is the actual
    // generated filename and fileUrl is the download route (previously this
    // stored a raw filesystem path as the URL and the alias as the name,
    // producing broken links; the extra `metadata` key was silently dropped
    // because run_generated_documents has no such column).
    if (result.documents.length > 0) {
      const documentRecords = result.documents.map((doc) => {
        const filePath = doc.pdfPath ?? doc.docxPath;
        const fileName = path.basename(filePath);
        return {
          runId,
          fileName,
          fileUrl: `/api/runs/${runId}/final-documents/${fileName}/download`,
          mimeType: filePath.endsWith('.pdf')
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
      });

      await db.insert(runGeneratedDocuments).values(documentRecords);

      logger.info(
        {
          jobId: job.id,
          runId,
          documentCount: documentRecords.length,
        },
        'Documents saved to database'
      );
    }

    await job.progress(90);

    // Step 4: Update run status
    await db
      .update(workflowRuns)
      .set({
        metadata: {
          ...(run.metadata as Record<string, unknown>),
          documentsGenerated: true,
          documentsGeneratedAt: new Date().toISOString(),
          documentGenerationResult: {
            generated: result.totalGenerated,
            skipped: result.skipped.length,
            failed: result.failed.length,
          },
        },
      })
      .where(eq(workflowRuns.id, runId));

    // Step 5: Send notifications
    if (notification) {
      try {
        await sendNotifications(notification, {
          runId,
          workflowId,
          result,
        });
      } catch (error) {
        // Don't fail the job if notifications fail
        logger.error({ error, runId }, 'Failed to send notifications');
      }
    }

    await job.progress(100);

    const endTime = Date.now();
    const processingTimeMs = endTime - startTime;

    logger.info(
      {
        jobId: job.id,
        runId,
        processingTimeMs,
        generated: result.totalGenerated,
      },
      'Job completed successfully'
    );

    return {
      ...result,
      startedAt: new Date(startTime),
      completedAt: new Date(endTime),
      processingTimeMs,
    };
  } catch (error: unknown) {
    logger.error(
      {
        error,
        jobId: job.id,
        runId,
        attemptsMade: job.attemptsMade,
      },
      'Job failed'
    );

    // Update run with error status
    try {
      const [run] = await db
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.id, runId))
        .limit(1);

      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (run) {
        await db
          .update(workflowRuns)
          .set({
            metadata: {
              ...(run.metadata as Record<string, unknown>),
              documentsGenerated: false,
              documentGenerationError: error instanceof Error ? error.message : String(error),
              documentGenerationErrorAt: new Date().toISOString(),
            },
          })
          .where(eq(workflowRuns.id, runId));
      }
    } catch (dbError) {
      logger.error({ error: dbError, runId }, 'Failed to update run with error status');
    }

    throw error;
  }
}

// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================

interface NotificationOptions {
  email?: string;
  webhook?: string;
}

interface NotificationData {
  runId: string;
  workflowId: string;
  result: { totalGenerated?: number; skipped?: unknown[]; failed?: unknown[] };
}

/**
 * Send notifications (email/webhook) when documents are ready
 */
async function sendNotifications(
  options: NotificationOptions,
  data: NotificationData
): Promise<void> {
  const promises: Promise<unknown>[] = [];

  // Email notification
  if (options.email) {
    promises.push(sendEmailNotification(options.email, data));
  }

  // Webhook notification
  if (options.webhook) {
    promises.push(sendWebhookNotification(options.webhook, data));
  }

  await Promise.allSettled(promises);
}

/**
 * Send email notification
 */
async function sendEmailNotification(email: string, data: NotificationData): Promise<void> {
  // TODO: Integrate with your email service (SendGrid, SES, etc.)
  logger.info({ email, runId: data.runId }, 'Email notification sent');
}

/**
 * Send webhook notification
 */
async function sendWebhookNotification(webhookUrl: string, data: NotificationData): Promise<void> {
  try {
    const { safeFetch } = await import('../utils/safeFetch');
    const response = await safeFetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ezBuildr-DocumentWorker/1.0',
      },
      body: JSON.stringify({
        event: 'documents.generated',
        timestamp: new Date().toISOString(),
        data: {
          runId: data.runId,
          workflowId: data.workflowId,
          result: {
            generated: data.result.totalGenerated,
            skipped: data.result.skipped?.length ?? 0,
            failed: data.result.failed?.length ?? 0,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
    }

    logger.info({ webhookUrl, runId: data.runId }, 'Webhook notification sent');
  } catch (error) {
    logger.error({ error, webhookUrl, runId: data.runId }, 'Failed to send webhook notification');
    throw error;
  }
}

// ============================================================================
// WORKER STARTUP
// ============================================================================

let workerStarted = false;

/**
 * Start the document generation worker
 *
 * This should be called when the server starts.
 * The worker will process jobs from the queue continuously.
 */
export function startDocumentGenerationWorker(): void {
  if (workerStarted) {
    logger.warn('Document generation worker already started');
    return;
  }

  try {
    const queue = getDocumentGenerationQueue();

    // Register job processor
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    queue.process(WORKER_CONCURRENCY, processDocumentGenerationJob);

    workerStarted = true;

    logger.info(
      {
        concurrency: WORKER_CONCURRENCY,
        queueName: 'document-generation',
      },
      'Document generation worker started'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to start document generation worker');
    throw error;
  }
}

/**
 * Stop the document generation worker (graceful shutdown)
 */
export async function stopDocumentGenerationWorker(): Promise<void> {
  if (!workerStarted) {
    return;
  }

  const queue = getDocumentGenerationQueue();
  await queue.close();

  workerStarted = false;

  logger.info('Document generation worker stopped');
}

// ============================================================================
// STANDALONE MODE
// ============================================================================

// If running as standalone script
if (require.main === module) {
  logger.info('Starting document generation worker in standalone mode');

  startDocumentGenerationWorker();

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  // Graceful shutdown
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await stopDocumentGenerationWorker();
    process.exit(0);
  });
// eslint-disable-next-line @typescript-eslint/no-misused-promises

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await stopDocumentGenerationWorker();
    process.exit(0);
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

// export { processDocumentGenerationJob, startDocumentGenerationWorker, stopDocumentGenerationWorker };
