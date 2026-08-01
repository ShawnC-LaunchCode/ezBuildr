import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunCompletionJob } from '@shared/schema';

import { RunCompletionJobWorker } from '../../../server/services/workflow-runs/RunCompletionJobWorker';

function makeJob(overrides: Partial<RunCompletionJob> = {}): RunCompletionJob {
  return {
    id: 'job-1',
    runId: 'run-1',
    kind: 'writebacks',
    status: 'processing',
    payload: { workflowId: 'workflow-1', userId: 'user-1' },
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
    executeWritebacks: vi.fn(),
    generateDocuments: vi.fn(),
  };
  let worker: RunCompletionJobWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    jobRepo.claimBatch.mockResolvedValue([]);
    jobRepo.markSucceeded.mockResolvedValue(undefined);
    jobRepo.markRetryOrDeadLetter.mockResolvedValue(undefined);
    lifecycleService.executeWritebacks.mockResolvedValue({ success: true, rowsCreated: 1, errors: [] });
    lifecycleService.generateDocuments.mockResolvedValue({ success: true, documentsGenerated: 1 });
    worker = new RunCompletionJobWorker(jobRepo as never, lifecycleService as never);
  });

  it('claims a bounded batch and acknowledges each successful job once', async () => {
    const jobs = [
      makeJob(),
      makeJob({
        id: 'job-2',
        kind: 'documents',
        payload: { workflowId: 'workflow-1' },
      }),
    ];
    jobRepo.claimBatch.mockResolvedValue(jobs);

    const processed = await worker.processBatch('worker-1', 2);

    expect(processed).toBe(2);
    expect(jobRepo.claimBatch).toHaveBeenCalledWith(expect.objectContaining({
      leaseOwner: 'worker-1',
      limit: 2,
      leaseMs: 60_000,
    }));
    expect(lifecycleService.executeWritebacks).toHaveBeenCalledTimes(1);
    expect(lifecycleService.executeWritebacks).toHaveBeenCalledWith(
      'run-1',
      'workflow-1',
      'user-1'
    );
    expect(lifecycleService.generateDocuments).toHaveBeenCalledTimes(1);
    expect(lifecycleService.generateDocuments).toHaveBeenCalledWith('run-1');
    expect(jobRepo.markSucceeded).toHaveBeenCalledTimes(2);
    expect(jobRepo.markSucceeded).toHaveBeenNthCalledWith(1, 'job-1', 'worker-1');
    expect(jobRepo.markSucceeded).toHaveBeenNthCalledWith(2, 'job-2', 'worker-1');
    expect(jobRepo.markRetryOrDeadLetter).not.toHaveBeenCalled();
  });

  it('records thrown handler errors without abandoning the rest of the batch', async () => {
    const writebackJob = makeJob();
    const documentJob = makeJob({ id: 'job-2', kind: 'documents' });
    jobRepo.claimBatch.mockResolvedValue([writebackJob, documentJob]);
    lifecycleService.executeWritebacks.mockRejectedValue(new Error('temporary connection failure'));

    const processed = await worker.processBatch('worker-1', 10);

    expect(processed).toBe(2);
    expect(jobRepo.markRetryOrDeadLetter).toHaveBeenCalledWith(
      writebackJob.id,
      'worker-1',
      expect.objectContaining({ message: 'temporary connection failure' })
    );
    expect(lifecycleService.generateDocuments).toHaveBeenCalledWith('run-1');
    expect(jobRepo.markSucceeded).toHaveBeenCalledWith('job-2', 'worker-1');
  });

  it('treats an explicit unsuccessful handler result as a failed attempt', async () => {
    const job = makeJob();
    jobRepo.claimBatch.mockResolvedValue([job]);
    lifecycleService.executeWritebacks.mockResolvedValue({
      success: false,
      rowsCreated: 0,
      errors: ['remote rejected the row'],
    });

    await worker.processBatch('worker-1', 10);

    expect(jobRepo.markSucceeded).not.toHaveBeenCalled();
    expect(jobRepo.markRetryOrDeadLetter).toHaveBeenCalledWith(
      job.id,
      'worker-1',
      expect.objectContaining({ message: 'remote rejected the row' })
    );
  });

  it('fails unknown job kinds instead of silently acknowledging them', async () => {
    const job = makeJob({ kind: 'future-operation' });
    jobRepo.claimBatch.mockResolvedValue([job]);

    await worker.processBatch('worker-1', 10);

    expect(lifecycleService.executeWritebacks).not.toHaveBeenCalled();
    expect(lifecycleService.generateDocuments).not.toHaveBeenCalled();
    expect(jobRepo.markSucceeded).not.toHaveBeenCalled();
    expect(jobRepo.markRetryOrDeadLetter).toHaveBeenCalledWith(
      job.id,
      'worker-1',
      expect.objectContaining({ message: 'Unsupported run completion job kind: future-operation' })
    );
  });
});
