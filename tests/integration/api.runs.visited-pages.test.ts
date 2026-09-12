import { randomBytes } from 'crypto';

import { desc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { workflowRunRepository } from '../../server/repositories';
import { hashToken } from '../../server/utils/encryption';
import { withTenant } from '../../server/utils/rlsContext';
import { buildTestWhen } from '../helpers/conditionFixtures';
import { expectCrossTenantDenied } from '../helpers/expectDenied';
import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';
import { TestFactory } from '../helpers/testFactory';

describe.sequential('SECT-8A reached-page history', () => {
  let ctx: IntegrationTestContext;
  let outsideCtx: IntegrationTestContext;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'SECT-8A reached pages',
      createProject: true,
    });
    outsideCtx = await setupIntegrationTest({
      tenantName: 'SECT-8A outside tenant',
    });
  });

  afterAll(async () => {
    await outsideCtx.cleanup();
    await ctx.cleanup();
  });

  async function readRun(runId: string): Promise<typeof schema.workflowRuns.$inferSelect> {
    const [run] = await getOwnerDb()
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, runId));
    return run;
  }

  it('tracks real start, navigation, skip, reload, resume, duplicates, null, and cross-tenant denial', async () => {
    const factory = new TestFactory();
    const { workflow } = await factory.createWorkflow(ctx.projectId!, ctx.userId);
    const page1 = await factory.createPage(workflow.id, { title: 'Reached one', order: 0 });
    const page2 = await factory.createPage(workflow.id, { title: 'Reached two', order: 1 });
    const skippedPage = await factory.createPage(workflow.id, { title: 'Visible but skipped', order: 2 });
    const page3 = await factory.createPage(workflow.id, { title: 'Reached three', order: 3 });
    await factory.createStep(page1.id, { title: 'First question', alias: 'firstQuestion', order: 0 });
    const controller = await factory.createStep(page2.id, {
      title: 'Skip controller',
      alias: 'skipController',
      order: 0,
    });
    await factory.createStep(skippedPage.id, { title: 'Skipped question', alias: 'skippedQuestion', order: 0 });
    await factory.createStep(page3.id, { title: 'Final question', alias: 'finalQuestion', order: 0 });
    await getOwnerDb().insert(schema.logicRules).values({
      workflowId: workflow.id,
      conditionStepId: controller.id,
      when: buildTestWhen(controller.id, 'equals', 'yes'),
      targetType: 'page',
      targetPageId: page3.id,
      action: 'skip_to',
      order: 0,
    });

    const createResponse = await request(ctx.baseURL)
      .post(`/api/workflows/${workflow.id}/runs`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({})
      .expect(201);
    const runId = createResponse.body.data.runId as string;
    const originalRunToken = createResponse.body.data.runToken as string;
    expect(createResponse.body.data).toMatchObject({
      currentPageId: page1.id,
      visitedPageIds: [page1.id],
    });
    expect((await readRun(runId)).visitedPageIds).toEqual([page1.id]);

    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/next`)
      .set('Authorization', `Bearer ${originalRunToken}`)
      // The server must advance from its persisted cursor, not this forged
      // client value (which names a different, later page).
      .send({ currentPageId: skippedPage.id })
      .expect(200)
      .expect(response => {
        expect(response.body.data.nextPageId).toBe(page2.id);
      });
    expect((await readRun(runId)).visitedPageIds).toEqual([page1.id, page2.id]);

    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${page2.id}/submit`)
      .set('Authorization', `Bearer ${originalRunToken}`)
      .send({ values: [{ stepId: controller.id, value: 'yes' }] })
      .expect(200);
    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/next`)
      .set('Authorization', `Bearer ${originalRunToken}`)
      .send({})
      .expect(200)
      .expect(response => {
        expect(response.body.data.nextPageId).toBe(page3.id);
      });

    const expectedHistory = [page1.id, page2.id, page3.id];
    const skippedResult = await readRun(runId);
    expect(skippedResult.currentPageId).toBe(page3.id);
    expect(skippedResult.visitedPageIds).toEqual(expectedHistory);
    expect(skippedResult.visitedPageIds).not.toContain(skippedPage.id);

    const reloadedRuntime = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set('Authorization', `Bearer ${originalRunToken}`)
      .expect(200);
    expect(reloadedRuntime.body.data.run.visitedPageIds).toEqual(expectedHistory);

    const beforeDenied = await readRun(runId);
    const beforeDeniedBytes = JSON.stringify(beforeDenied.visitedPageIds);
    const denied = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/next`)
      .set('Authorization', `Bearer ${outsideCtx.authToken}`)
      .send({});
    expect(denied.status).toBe(404);
    expectCrossTenantDenied(denied.status);
    expect(JSON.stringify((await readRun(runId)).visitedPageIds)).toBe(beforeDeniedBytes);

    // Emulate a legacy/inconsistent record whose cursor was saved before its
    // reached-page entry. Resume repairs that exact current page atomically.
    await getOwnerDb().update(schema.workflowRuns)
      .set({ visitedPageIds: [page1.id, page2.id] })
      .where(eq(schema.workflowRuns.id, runId));
    const recipientEmail = `sect-8a-${randomBytes(6).toString('hex')}@example.com`;
    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/resume-links`)
      .set('Authorization', `Bearer ${originalRunToken}`)
      .send({ email: recipientEmail, expiryMinutes: 60 })
      .expect(202);
    const [queuedEmail] = await getOwnerDb().select()
      .from(schema.emailQueue)
      .where(eq(schema.emailQueue.to, recipientEmail))
      .orderBy(desc(schema.emailQueue.createdAt))
      .limit(1);
    const resumeMatch = /[?&]resume=([a-f0-9]+)/i.exec(queuedEmail.html);
    expect(resumeMatch?.[1]).toBeTruthy();
    const resumeToken = resumeMatch![1];
    const [issuedLink] = await getOwnerDb().select()
      .from(schema.runResumeLinks)
      .where(eq(schema.runResumeLinks.runId, runId))
      .orderBy(desc(schema.runResumeLinks.createdAt))
      .limit(1);
    expect(issuedLink.tokenHash).toBe(hashToken(resumeToken));

    const resumeResponse = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/resume`)
      .send({ token: resumeToken })
      .expect(200);
    const restoredRunToken = resumeResponse.body.data.runToken as string;
    expect(resumeResponse.body.data).toMatchObject({
      currentPageId: page3.id,
      visitedPageIds: expectedHistory,
    });
    expect((await readRun(runId)).visitedPageIds).toEqual(expectedHistory);

    const restoredRuntime = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set('Authorization', `Bearer ${restoredRunToken}`)
      .expect(200);
    expect(restoredRuntime.body.data.run.visitedPageIds).toEqual(expectedHistory);

    const duplicate = await withTenant(ctx.tenantId, (tx) =>
      workflowRunRepository.advanceIfIncomplete(runId, page3.id, undefined, tx));
    expect(duplicate.visitedPageIds).toEqual(expectedHistory);

    const nulled = await withTenant(ctx.tenantId, (tx) =>
      workflowRunRepository.advanceIfIncomplete(runId, null, undefined, tx));
    expect(nulled.currentPageId).toBeNull();
    expect(nulled.visitedPageIds).toEqual(expectedHistory);
  });
});
