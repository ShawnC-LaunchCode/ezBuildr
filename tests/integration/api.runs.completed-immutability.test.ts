import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import request, { type Response } from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import { workflowRunRepository } from '../../server/repositories';
import { runService } from '../../server/services/RunService';
import { hashToken } from '../../server/utils/encryption';
import { versionService } from '../../server/services/VersionService';
import { ApiError } from '../../server/utils/errors';
import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';

interface TestRun {
  id: string;
  token: string;
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function expectRunCompleted(response: Response): void {
  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({
    success: false,
    code: 'RUN_COMPLETED',
    error: 'Run is already completed',
  });
}

describe.sequential('completed run answer immutability', () => {
  let ctx: IntegrationTestContext;
  let workflowId: string;
  let versionId: string;
  let stepId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Completed run immutability',
      createProject: true,
    });

    const factory = new TestFactory();
    const { workflow, version } = await factory.createWorkflow(ctx.projectId!, ctx.userId);
    workflowId = workflow.id;
    versionId = version.id;

    const section = await factory.createSection(workflowId, {
      title: 'Answers',
      order: 0,
    });
    const step = await factory.createStep(section.id, {
      title: 'Name',
      alias: 'name',
      type: 'short_text',
      order: 0,
      required: false,
    });
    stepId = step.id;

    // RVP-7: value writes now validate step membership against the run's
    // pinned definition, so the pinned version has to contain the step created
    // above. factory.createWorkflow snapshots the workflow before it exists,
    // and a run pinned to that empty graph would be rejected for the wrong
    // reason — obscuring the completion guard this suite actually tests.
    const pinnedVersion = await versionService.createDraftVersion(workflowId, ctx.userId);
    if (pinnedVersion) { versionId = pinnedVersion.id; }
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  // If a test ever times out, vitest abandons its in-flight promise without
  // cancelling it — the `finally` block that calls markCompleteSpy.mockRestore()
  // never runs, leaving a stale spy on the shared workflowRunRepository
  // singleton that poisons every later test (in this file and this worker's
  // later files) that calls markComplete. Force a clean slate regardless.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createRun(completed = false): Promise<TestRun> {
    const token = `completed-immutability-${randomUUID()}`;
    const [run] = await db.insert(schema.workflowRuns).values({
      workflowId,
      workflowVersionId: versionId,
      runToken: hashToken(token),
      tokenExpiresAt: new Date(Date.now() + 60_000),
      completed,
      completedAt: completed ? new Date() : null,
    }).returning();
    return { id: run.id, token };
  }

  async function expectNoValue(runId: string): Promise<void> {
    const values = await db.select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));
    expect(values).toEqual([]);
  }

  it('rejects creator and run-token single-value writes after completion', async () => {
    const creatorRun = await createRun(true);
    const tokenRun = await createRun(true);

    const creatorResponse = await request(ctx.baseURL)
      .post(`/api/runs/${creatorRun.id}/values`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ stepId, value: 'creator write after completion' });
    const tokenResponse = await request(ctx.baseURL)
      .post(`/api/runs/${tokenRun.id}/values`)
      .set('Authorization', `Bearer ${tokenRun.token}`)
      .send({ stepId, value: 'token write after completion' });

    expectRunCompleted(creatorResponse);
    expectRunCompleted(tokenResponse);
    await expectNoValue(creatorRun.id);
    await expectNoValue(tokenRun.id);
  });

  it('rejects creator and run-token bulk writes after completion', async () => {
    const creatorRun = await createRun(true);
    const tokenRun = await createRun(true);

    const creatorResponse = await request(ctx.baseURL)
      .post(`/api/runs/${creatorRun.id}/values/bulk`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ values: [{ stepId, value: 'creator bulk after completion' }] });
    const tokenResponse = await request(ctx.baseURL)
      .post(`/api/runs/${tokenRun.id}/values/bulk`)
      .set('Authorization', `Bearer ${tokenRun.token}`)
      .send({ values: [{ stepId, value: 'token bulk after completion' }] });

    expectRunCompleted(creatorResponse);
    expectRunCompleted(tokenResponse);
    await expectNoValue(creatorRun.id);
    await expectNoValue(tokenRun.id);
  });

  // These two cases race a write against an in-flight completion. They drive
  // the service layer directly rather than HTTP: the race the boundary must
  // win is between the two DB operations (markComplete's open transaction vs
  // the write path's completion check), and going through supertest/Express
  // adds socket accept and routing scheduling that — under a full-suite
  // worker's load, on the single-connection test pool — reordered the steps
  // nondeterministically and hung the paused transaction. The HTTP contract
  // (409 + RUN_COMPLETED body) is covered by the two non-racing tests above.
  it.each([
    {
      label: 'single creator autosave',
      lateWrite: (run: TestRun) =>
        runService.upsertStepValue(run.id, ctx.userId, {
          runId: run.id,
          stepId,
          value: 'late single value',
        }),
    },
    {
      label: 'bulk run-token autosave',
      lateWrite: (run: TestRun) =>
        runService.bulkUpsertValuesNoAuth(run.id, [
          { stepId, value: 'late bulk value' },
        ]),
    },
  ])('prevents a $label from crossing an in-flight completion boundary', async ({
    lateWrite,
  }) => {
    const run = await createRun();
    const completionReachedBoundary = deferred();
    const releaseCompletion = deferred();
    const originalMarkComplete = workflowRunRepository.markComplete.bind(workflowRunRepository);
    const markCompleteSpy = vi.spyOn(workflowRunRepository, 'markComplete')
      .mockImplementation(async (...args) => {
        const completedRun = await originalMarkComplete(...args);
        completionReachedBoundary.resolve();
        await releaseCompletion.promise;
        return completedRun;
      });

    try {
      const completionPromise = runService.completeRunNoAuth(run.id);

      // Completion is now paused inside its open transaction, after the run
      // row is marked complete but before commit — the exact boundary a
      // production race would cross.
      await completionReachedBoundary.promise;

      // Fire the late write while completion is still uncommitted, then
      // release. Its queries queue behind the paused transaction's pooled
      // connection, so it observes the run only after completion commits —
      // in production (multi-connection pool) the same ordering is enforced
      // by assertRunsMutable's SELECT ... FOR UPDATE on the run row instead.
      const lateWritePromise = lateWrite(run);
      releaseCompletion.resolve();

      const [lateWriteResult, completionResult] = await Promise.allSettled([
        lateWritePromise,
        completionPromise,
      ]);

      expect(lateWriteResult.status).toBe('rejected');
      const lateWriteError = (lateWriteResult as PromiseRejectedResult).reason as ApiError;
      expect(lateWriteError).toBeInstanceOf(ApiError);
      expect(lateWriteError.code).toBe('RUN_COMPLETED');
      await expectNoValue(run.id);

      expect(completionResult.status).toBe('fulfilled');
      const completedRun = (completionResult as PromiseFulfilledResult<typeof schema.workflowRuns.$inferSelect>).value;
      expect(completedRun).toMatchObject({ id: run.id, completed: true });
    } finally {
      releaseCompletion.resolve();
      markCompleteSpy.mockRestore();
    }
  });
});
