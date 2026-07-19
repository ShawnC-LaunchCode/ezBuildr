import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import { workflowRunRepository } from '../../server/repositories';
import { hashToken } from '../../server/utils/encryption';
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
  });

  afterAll(async () => {
    await ctx.cleanup();
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

  it.each([
    {
      label: 'single creator autosave',
      path: (runId: string) => `/api/runs/${runId}/values`,
      body: () => ({ stepId, value: 'late single value' }),
      writeAuth: () => ctx.authToken,
    },
    {
      label: 'bulk run-token autosave',
      path: (runId: string) => `/api/runs/${runId}/values/bulk`,
      body: () => ({ values: [{ stepId, value: 'late bulk value' }] }),
      writeAuth: (run: TestRun) => run.token,
    },
  ])('prevents a $label from crossing an in-flight completion boundary', async ({
    path,
    body,
    writeAuth,
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
      const completionRequest = request(ctx.baseURL)
        .put(`/api/runs/${run.id}/complete`)
        .set('Authorization', `Bearer ${run.token}`)
        .send();
      const completionPromise = completionRequest.then(response => response);

      await completionReachedBoundary.promise;

      const lateWriteResponse = await request(ctx.baseURL)
        .post(path(run.id))
        .set('Authorization', `Bearer ${writeAuth(run)}`)
        .send(body());

      expectRunCompleted(lateWriteResponse);
      await expectNoValue(run.id);

      releaseCompletion.resolve();
      const completionResponse = await completionPromise;
      expect(completionResponse.status).toBe(200);
      expect(completionResponse.body).toMatchObject({
        success: true,
        data: { id: run.id, completed: true },
      });
    } finally {
      releaseCompletion.resolve();
      markCompleteSpy.mockRestore();
    }
  });
});
