/**
 * Document Generation Queue
 *
 * Async job queue for document generation using Bull and Redis.
 * This allows document generation to happen in the background without
 * blocking HTTP requests.
 *
 * SETUP REQUIRED:
 * 1. Install dependencies:
 *    npm install bull @types/bull ioredis @types/ioredis
 *
 * 2. Set environment variable:
 *    REDIS_URL=redis://localhost:6379
 *    or
 *    REDIS_HOST=localhost
 *    REDIS_PORT=6379
 *    REDIS_PASSWORD=yourpassword (optional)
 *
 * 3. Ensure Redis is running:
 *    docker run -d -p 6379:6379 redis:alpine
 *    or install Redis locally
 *
 * Benefits:
 * - Non-blocking workflow completion
 * - Automatic retries on failure
 * - Better error isolation
 * - Horizontal scalability
 * - Job progress tracking
 * - Failed job inspection
 */

import Bull, { Job, Queue } from 'bull';

import { logger } from '../logger';

import type { FinalBlockRenderOptions, FinalBlockRenderResult } from '../services/document/EnhancedDocumentEngine';

// ============================================================================
// TYPES
// ============================================================================

export interface DocumentGenerationJobData {
  /** Workflow run ID */
  runId: string;

  /** Workflow ID */
  workflowId: string;

  /** User ID who triggered the generation */
  userId: string;

  /** Tenant ID for multi-tenancy */
  tenantId?: string;

  /** Document generation options */
  renderOptions: FinalBlockRenderOptions;

  /** Priority (1-10, higher = more priority) */
  priority?: number;

  /** Notification settings */
  notification?: {
    email?: string;
    webhook?: string;
  };
}

export interface DocumentGenerationJobResult extends FinalBlockRenderResult {
  /** When the job started */
  startedAt: Date;

  /** When the job completed */
  completedAt: Date;

  /** Total processing time in milliseconds */
  processingTimeMs: number;
}

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

const QUEUE_NAME = 'document-generation';

const REDIS_CONFIG = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    // Alternative: use REDIS_URL
    ...(process.env.REDIS_URL && { redis: process.env.REDIS_URL }),
  },
};

const JOB_OPTIONS = {
  attempts: 3, // Retry up to 3 times
  backoff: {
    type: 'exponential' as const,
    delay: 2000, // Start with 2s, then 4s, then 8s
  },
  removeOnComplete: false, // Keep completed jobs for 7 days
  removeOnFail: false, // Keep failed jobs for inspection
};

// ============================================================================
// QUEUE INSTANCE
// ============================================================================

let queueInstance: Queue<DocumentGenerationJobData> | null = null;

/**
 * Get or create the document generation queue
 */
export function getDocumentGenerationQueue(): Queue<DocumentGenerationJobData> {
  if (queueInstance) {
    return queueInstance;
  }

  try {
    queueInstance = new Bull<DocumentGenerationJobData>(QUEUE_NAME, REDIS_CONFIG);

    // Queue event listeners
    queueInstance.on('error', (error) => {
      logger.error({ error }, 'Document generation queue error');
    });

    queueInstance.on('waiting', (jobId) => {
      logger.debug({ jobId }, 'Job waiting in queue');
    });

    queueInstance.on('active', (job) => {
      logger.info({ jobId: job.id, runId: job.data.runId }, 'Job started processing');
    });

    queueInstance.on('completed', (job: Job, result: any) => {
      logger.info(
        {
          jobId: job.id,
          runId: job.data.runId,
          generated: result.totalGenerated,
          failed: result.failed.length,
          processingTimeMs: result.processingTimeMs,
        },
        'Job completed successfully'
      );
    });

    queueInstance.on('failed', (job: Job, error: Error) => {
      logger.error(
        {
          jobId: job?.id,
          runId: job?.data.runId,
          error: error.message,
          attemptsMade: job?.attemptsMade,
          attemptsMax: job?.opts.attempts,
        },
        'Job failed'
      );
    });

    queueInstance.on('stalled', (job: Job) => {
      logger.warn({ jobId: job.id, runId: job.data.runId }, 'Job stalled');
    });

    logger.info({ queueName: QUEUE_NAME }, 'Document generation queue initialized');

    return queueInstance;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize document generation queue');
    throw new Error(
      'Failed to initialize document generation queue. Is Redis running? Check REDIS_URL or REDIS_HOST/PORT.'
    );
  }
}

// ============================================================================
// QUEUE OPERATIONS
// ============================================================================

/**
 * Add a document generation job to the queue
 *
 * @param data - Job data
 * @param options - Additional job options
 * @returns Job instance
 */
export async function enqueueDocumentGeneration(
  data: DocumentGenerationJobData,
  options?: Bull.JobOptions
): Promise<Job<DocumentGenerationJobData>> {
  const queue = getDocumentGenerationQueue();

  const job = await queue.add(data, {
    ...JOB_OPTIONS,
    ...options,
    priority: data.priority || 5, // Default priority
    jobId: `run-${data.runId}-${Date.now()}`, // Unique job ID
  });

  logger.info(
    {
      jobId: job.id,
      runId: data.runId,
      workflowId: data.workflowId,
      documentCount: data.renderOptions.documents.length,
    },
    'Document generation job enqueued'
  );

  return job;
}

/**
 * Get the status of a document generation job
 *
 * @param jobId - Job ID
 * @returns Job instance or null if not found
 */
export async function getJobStatus(
  jobId: string
): Promise<Job<DocumentGenerationJobData> | null> {
  const queue = getDocumentGenerationQueue();
  return queue.getJob(jobId);
}

/**
 * Get the status of a job by run ID
 *
 * @param runId - Workflow run ID
 * @returns Job instance or null if not found
 */
export async function getJobByRunId(
  runId: string
): Promise<Job<DocumentGenerationJobData> | null> {
  const queue = getDocumentGenerationQueue();

  // Search for job with this run ID
  const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed']);

  return jobs.find((job: Job<DocumentGenerationJobData>) => job.data.runId === runId) || null;
}

/**
 * Cancel a pending or active job
 *
 * @param jobId - Job ID
 * @returns True if cancelled, false if not found or already completed
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const queue = getDocumentGenerationQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    return false;
  }

  const state = await job.getState();

  if (state === 'waiting' || state === 'active' || state === 'delayed') {
    await job.remove();
    logger.info({ jobId }, 'Job cancelled');
    return true;
  }

  return false;
}

/**
 * Get queue metrics
 *
 * @returns Queue statistics
 */
export async function getQueueMetrics() {
  const queue = getDocumentGenerationQueue();

  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.getPausedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    paused,
    total: waiting + active + completed + failed + delayed,
  };
}

/**
 * Clean up old completed and failed jobs
 *
 * @param grace - Grace period in milliseconds (default: 7 days)
 */
export async function cleanOldJobs(grace: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const queue = getDocumentGenerationQueue();

  const [removedCompleted, removedFailed] = await Promise.all([
    queue.clean(grace, 'completed'),
    queue.clean(grace, 'failed'),
  ]);

  logger.info(
    {
      removedCompleted: removedCompleted.length,
      removedFailed: removedFailed.length,
      gracePeriodMs: grace,
    },
    'Old jobs cleaned'
  );
}

/**
 * Gracefully close the queue (call on server shutdown)
 */
export async function closeQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
    logger.info('Document generation queue closed');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { Queue, Job };
// export type { DocumentGenerationJobData, DocumentGenerationJobResult };
