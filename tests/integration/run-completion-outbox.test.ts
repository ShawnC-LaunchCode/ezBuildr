import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import {
  runCompletionJobRepository,
  workflowRunRepository,
} from '../../server/repositories';
import { runStateService } from '../../server/services/workflow-runs/RunStateService';
import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';

describe.sequential('durable run completion outbox', () => {
  let ctx: IntegrationTestContext;
  let workflowId: string;
  let versionId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Run completion outbox',
      createProject: true,
    });
    const factory = new TestFactory();
    const { workflow, version } = await factory.createWorkflow(ctx.projectId!, ctx.userId);
    workflowId = workflow.id;
    versionId = version.id;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  // claimBatch is a deliberately global, unscoped queue claim (no runId filter —
  // a real worker drains the whole table). Each test's assertions assume it is
  // the only claimable work in the table, so the leftover pending rows other
  // tests enqueue but never claim must not survive between tests.
  beforeEach(async () => {
    await db.delete(schema.runCompletionJobs);
  });

  async function createRun(): Promise<typeof schema.workflowRuns.$inferSelect> {
    const [run] = await db.insert(schema.workflowRuns).values({
      workflowId,
      workflowVersionId: versionId,
      runToken: `outbox-${randomUUID()}`,
    }).returning();
    return run;
  }

  async function jobsFor(runId: string): Promise<Array<typeof schema.runCompletionJobs.$inferSelect>> {
    return db.select()
      .from(schema.runCompletionJobs)
      .where(eq(schema.runCompletionJobs.runId, runId));
  }

  it('commits completion and both required jobs atomically', async () => {
    const committedRun = await createRun();

    await runStateService.markCompletedAndEnqueue(committedRun.id, workflowId, ctx.userId);

    const completed = await workflowRunRepository.findById(committedRun.id);
    const committedJobs = await jobsFor(committedRun.id);
    expect(completed?.completed).toBe(true);
    expect(committedJobs.map(job => job.kind).sort()).toEqual(['documents', 'writebacks']);

    const rolledBackRun = await createRun();
    await expect(workflowRunRepository.transaction(async tx => {
      await workflowRunRepository.markComplete(rolledBackRun.id, tx);
      await runCompletionJobRepository.enqueue({
        runId: rolledBackRun.id,
        kind: 'writebacks',
        payload: { workflowId },
      }, tx);
      throw new Error('simulate process failure before commit');
    })).rejects.toThrow('simulate process failure before commit');

    const afterRollback = await workflowRunRepository.findById(rolledBackRun.id);
    expect(afterRollback?.completed).toBe(false);
    expect(await jobsFor(rolledBackRun.id)).toEqual([]);
  });

  it('deduplicates enqueue by stable run and operation identity', async () => {
    const run = await createRun();

    const [first, duplicate] = await runCompletionJobRepository.transaction(async tx => {
      const input = {
        runId: run.id,
        kind: 'documents' as const,
        payload: { workflowId },
      };
      const firstJob = await runCompletionJobRepository.enqueue(input, tx);
      const duplicateJob = await runCompletionJobRepository.enqueue(input, tx);
      return [firstJob, duplicateJob];
    });

    expect(duplicate.id).toBe(first.id);
    expect(await jobsFor(run.id)).toHaveLength(1);
  });

  it('allows concurrent workers to claim jobs without duplicate delivery', async () => {
    const run = await createRun();
    await runCompletionJobRepository.transaction(async tx => {
      await runCompletionJobRepository.enqueue({ runId: run.id, kind: 'writebacks' }, tx);
      await runCompletionJobRepository.enqueue({ runId: run.id, kind: 'documents' }, tx);
    });
    const now = new Date(Date.now() + 1_000);

    const [workerA, workerB] = await Promise.all([
      runCompletionJobRepository.claimBatch({ leaseOwner: 'worker-a', limit: 2, now }),
      runCompletionJobRepository.claimBatch({ leaseOwner: 'worker-b', limit: 2, now }),
    ]);

    const allClaimedIds = [...workerA, ...workerB].map(job => job.id);
    expect(allClaimedIds).toHaveLength(2);
    expect(new Set(allClaimedIds).size).toBe(2);
  });

  it('reclaims a stale lease after a worker crashes', async () => {
    const run = await createRun();
    await runCompletionJobRepository.transaction(async tx => {
      await runCompletionJobRepository.enqueue({ runId: run.id, kind: 'documents' }, tx);
    });
    const claimedAt = new Date(Date.now() + 1_000);
    const [firstClaim] = await runCompletionJobRepository.claimBatch({
      leaseOwner: 'crashed-worker',
      limit: 1,
      leaseMs: 1_000,
      now: claimedAt,
    });

    const beforeExpiry = await runCompletionJobRepository.claimBatch({
      leaseOwner: 'replacement-worker',
      limit: 1,
      now: new Date(claimedAt.getTime() + 999),
    });
    const [reclaimed] = await runCompletionJobRepository.claimBatch({
      leaseOwner: 'replacement-worker',
      limit: 1,
      now: new Date(claimedAt.getTime() + 1_000),
    });

    expect(beforeExpiry).toEqual([]);
    expect(reclaimed.id).toBe(firstClaim.id);
    expect(reclaimed.leaseOwner).toBe('replacement-worker');
    expect(reclaimed.attempts).toBe(2);
  });

  it('backs off transient failures, dead-letters the final attempt, and bounds errors', async () => {
    const run = await createRun();
    await runCompletionJobRepository.transaction(async tx => {
      await runCompletionJobRepository.enqueue({
        runId: run.id,
        kind: 'writebacks',
        maxAttempts: 2,
      }, tx);
    });
    const firstAttemptAt = new Date(Date.now() + 1_000);
    const [firstAttempt] = await runCompletionJobRepository.claimBatch({
      leaseOwner: 'worker-a',
      limit: 1,
      now: firstAttemptAt,
    });
    const retry = await runCompletionJobRepository.markRetryOrDeadLetter(
      firstAttempt.id,
      'worker-a',
      new Error('temporary failure'),
      { now: firstAttemptAt, baseDelayMs: 100, maxDelayMs: 100 }
    );

    expect(retry).toMatchObject({ status: 'retry', attempts: 1, lastError: 'temporary failure' });
    expect(retry?.availableAt).toEqual(new Date(firstAttemptAt.getTime() + 100));
    expect(await runCompletionJobRepository.claimBatch({
      leaseOwner: 'worker-b',
      limit: 1,
      now: new Date(firstAttemptAt.getTime() + 99),
    })).toEqual([]);

    const [finalAttempt] = await runCompletionJobRepository.claimBatch({
      leaseOwner: 'worker-b',
      limit: 1,
      now: new Date(firstAttemptAt.getTime() + 100),
    });
    const deadLetter = await runCompletionJobRepository.markRetryOrDeadLetter(
      finalAttempt.id,
      'worker-b',
      new Error('x'.repeat(5_000)),
      { now: new Date(firstAttemptAt.getTime() + 100) }
    );

    expect(deadLetter?.status).toBe('dead_letter');
    expect(deadLetter?.attempts).toBe(2);
    expect(deadLetter?.completedAt).toEqual(new Date(firstAttemptAt.getTime() + 100));
    expect(deadLetter?.lastError).toHaveLength(4_000);
  });
});
