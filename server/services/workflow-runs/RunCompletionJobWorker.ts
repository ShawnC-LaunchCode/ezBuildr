import { randomUUID } from 'crypto';
import { hostname } from 'os';

import type { RunCompletionJob } from '@shared/schema';

import { createLogger } from '../../logger';
import {
  runCompletionJobRepository,
  type RunCompletionJobRepository,
} from '../../repositories/RunCompletionJobRepository';

import { runLifecycleService, type RunLifecycleService } from './RunLifecycleService';

const logger = createLogger({ module: 'run-completion-job-worker' });
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_POLL_MS = 5_000;

export interface RunCompletionJobWorkerOptions {
  batchSize?: number;
  leaseMs?: number;
  pollMs?: number;
  workerId?: string;
}

/**
 * Delivers durable post-completion work from PostgreSQL. Claims are fenced by
 * lease owner; a crashed process leaves reclaimable work rather than owning the
 * only copy in a process-local promise.
 */
export class RunCompletionJobWorker {
  private readonly workerId: string;
  private timer: ReturnType<typeof setInterval> | undefined;
  private polling = false;

  constructor(
    private readonly jobRepo: RunCompletionJobRepository = runCompletionJobRepository,
    private readonly lifecycleService: RunLifecycleService = runLifecycleService,
    private readonly options: RunCompletionJobWorkerOptions = {}
  ) {
    this.workerId = options.workerId ?? `${hostname()}:${process.pid}:${randomUUID()}`;
  }

  async processBatch(
    leaseOwner = this.workerId,
    limit = this.options.batchSize ?? DEFAULT_BATCH_SIZE
  ): Promise<number> {
    const jobs = await this.jobRepo.claimBatch({
      leaseOwner,
      limit,
      leaseMs: this.options.leaseMs ?? DEFAULT_LEASE_MS,
    });

    for (const job of jobs) {
      await this.processJob(job, leaseOwner);
    }
    return jobs.length;
  }

  start(): void {
    if (this.timer !== undefined) {return;}
    const pollMs = Math.max(250, this.options.pollMs ?? DEFAULT_POLL_MS);
    this.timer = setInterval(() => { void this.poll(); }, pollMs);
    this.timer.unref?.();
    void this.poll();
    logger.info({ workerId: this.workerId, pollMs }, 'Run completion job worker started');
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
      logger.info({ workerId: this.workerId }, 'Run completion job worker stopped');
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) {return;}
    this.polling = true;
    try {
      await this.processBatch();
    } catch (error: unknown) {
      logger.error({ error, workerId: this.workerId }, 'Run completion worker poll failed');
    } finally {
      this.polling = false;
    }
  }

  private async processJob(job: RunCompletionJob, leaseOwner: string): Promise<void> {
    try {
      if (job.kind === 'documents') {
        const result = await this.lifecycleService.generateDocuments(job.runId);
        if (!result.success) {
          throw new Error('Document generation failed');
        }
      } else {
        throw new Error(`Unsupported run completion job kind: ${job.kind}`);
      }

      const acknowledged = await this.jobRepo.markSucceeded(job.id, leaseOwner);
      if (acknowledged === undefined) {
        logger.warn({ jobId: job.id, leaseOwner }, 'Completion job lease was lost before acknowledgement');
      }
    } catch (error: unknown) {
      await this.jobRepo.markRetryOrDeadLetter(job.id, leaseOwner, error);
      logger.warn({
        error,
        jobId: job.id,
        runId: job.runId,
        kind: job.kind,
        attempt: job.attempts,
      }, 'Run completion job attempt failed');
    }
  }
}

export const runCompletionJobWorker = new RunCompletionJobWorker();
