import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunCompletionJob } from '@shared/schema';

import { RunCompletionJobWorker } from '../../../server/services/workflow-runs/RunCompletionJobWorker';

function makeJob(overrides: Partial<RunCompletionJob> = {}): RunCompletionJob {
  return {
    id: 'job-1',
    runId: 'run-1',
    kind: 'documents',
    status: 'processing',
    payload: null,
    attempts: 1,
    maxAttempts: 5,
    availableAt: new Date('2026-07-18T12:00:00.000Z'),
    leaseOwner: 'worker-1',
    leaseExpiresAt: new Date('2026-07-18T12:01:00.000Z'),
    lastError: null,
    completedAt: null,
    createdAt: new Date('2026-07-18T12:00:00.000Z'),
    updatedAt: new Date('2026-07-18T12:00:00.000Z'),
    ...overrides,
  };
}

describe('RunCompletionJobWorker', () => {
  const jobRepo = {
    claimBatch: vi.fn(),
    markSucceeded: vi.fn(),
    markRetryOrDeadLetter: vi.fn(),
  };
  const lifecycleService = {
    generateDocuments: vi.fn(),
  };
  let worker: RunCompletionJobWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    jobRepo.claimBatch.mockResolvedValue([]);
    jobRepo.markSucceeded.mockResolvedValue(undefined);
    jobRepo.markRetryOrDeadLetter.mockResolvedValue(undefined);
    lifecycleService.generateDocuments.mockResolvedValue({ success: true, documentsGenerated: 1 });
    worker = new RunCompletionJobWorker(jobRepo as never, lifecycleService as never);
  });

  it('claims a bounded batch and acknowledges each successful job once', async () => {
    jobRepo.claimBatch.mockResolvedValue([makeJob()]);

    const processed = await worker.processBatch('worker-1', 2);

    expect(processed).toBe(1);
    expect(jobRepo.claimBatch).toHaveBeenCalledWith(expect.objectContaining({
      leaseOwner: 'worker-1',
      limit: 2,
      leaseMs: 60_000,
    }));
    expect(lifecycleService.generateDocuments).toHaveBeenCalledWith('run-1');
    expect(jobRepo.markSucceeded).toHaveBeenCalledWith('job-1', 'worker-1');
    expect(jobRepo.markRetryOrDeadLetter).not.toHaveBeenCalled();
  });

  it('records thrown handler errors without abandoning the rest of the batch', async () => {
    const failedJob = makeJob();
    const successfulJob = makeJob({ id: 'job-2', runId: 'run-2' });
    jobRepo.claimBatch.mockResolvedValue([failedJob, successfulJob]);
    lifecycleService.generateDocuments
      .mockRejectedValueOnce(new Error('temporary connection failure'))
      .mockResolvedValueOnce({ success: true, documentsGenerated: 1 });

    const processed = await worker.processBatch('worker-1', 10);

    expect(processed).toBe(2);
    expect(jobRepo.markRetryOrDeadLetter).toHaveBeenCalledWith(
      failedJob.id,
      'worker-1',
      expect.objectContaining({ message: 'temporary connection failure' })
    );
    expect(lifecycleService.generateDocuments).toHaveBeenCalledWith('run-2');
    expect(jobRepo.markSucceeded).toHaveBeenCalledWith('job-2', 'worker-1');
  });

  it('treats an explicit unsuccessful handler result as a failed attempt', async () => {
    const job = makeJob();
    jobRepo.claimBatch.mockResolvedValue([job]);
    lifecycleService.generateDocuments.mockResolvedValue({ success: false, documentsGenerated: 0 });

    await worker.processBatch('worker-1', 10);

    expect(jobRepo.markSucceeded).not.toHaveBeenCalled();
    expect(jobRepo.markRetryOrDeadLetter).toHaveBeenCalledWith(
      job.id,
      'worker-1',
      expect.objectContaining({ message: 'Document generation failed' })
    );
  });

  it('fails unknown job kinds instead of silently acknowledging them', async () => {
    const job = makeJob({ kind: 'future-operation' });
    jobRepo.claimBatch.mockResolvedValue([job]);

    await worker.processBatch('worker-1', 10);

    expect(lifecycleService.generateDocuments).not.toHaveBeenCalled();
    expect(jobRepo.markSucceeded).not.toHaveBeenCalled();
    expect(jobRepo.markRetryOrDeadLetter).toHaveBeenCalledWith(
      job.id,
      'worker-1',
      expect.objectContaining({ message: 'Unsupported run completion job kind: future-operation' })
    );
  });
});
