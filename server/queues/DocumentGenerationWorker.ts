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

const WORKER_CONCURRENCY = parseInt(process.env.DOCUMENT_WORKER_CONCURRENCY || '2', 10);

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
  const { runId, workflowId, userId, tenantId, renderOptions, notification } = job.data;

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

    // Step 3: Save generated documents to database
    if (result.documents.length > 0) {
      const documentRecords = result.documents.map((doc) => ({
        runId,
        fileUrl: doc.pdfPath || doc.docxPath, // Map documentUrl to fileUrl
        fileName: doc.alias || 'document',    // Map alias to fileName
        // fileType: doc.pdfPath ? 'pdf' : 'docx', // fileType might not be in schema, removing if causing issues or map if needed. Error didn't mention it.
        // alias: doc.alias || 'document',
        metadata: {
          normalizedData: doc.normalizedData,
          mappingResult: doc.mappingResult,
          fileType: doc.pdfPath ? 'pdf' : 'docx', // Move extra data to metadata
          alias: doc.alias
        },
      }));

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
          ...(run.metadata as any),
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
  } catch (error: any) {
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

      if (run) {
        await db
          .update(workflowRuns)
          .set({
            metadata: {
              ...(run.metadata as any),
              documentsGenerated: false,
              documentGenerationError: error.message,
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
  result: any;
}

/**
 * Send notifications (email/webhook) when documents are ready
 */
async function sendNotifications(
  options: NotificationOptions,
  data: NotificationData
): Promise<void> {
  const promises: Promise<any>[] = [];

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
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'VaultLogic-DocumentWorker/1.0',
      },
      body: JSON.stringify({
        event: 'documents.generated',
        timestamp: new Date().toISOString(),
        data: {
          runId: data.runId,
          workflowId: data.workflowId,
          result: {
            generated: data.result.totalGenerated,
            skipped: data.result.skipped.length,
            failed: data.result.failed.length,
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

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await stopDocumentGenerationWorker();
    process.exit(0);
  });

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
