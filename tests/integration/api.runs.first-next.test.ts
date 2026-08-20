/**
 * ICW2-B9: the first POST /api/runs/:id/next on a fresh run must advance
 * past the first section instead of no-op'ing.
 *
 * Root cause: run.currentSectionId started NULL at creation, and
 * calculateNextSection special-cases a null current section as "return the
 * first visible section" — so the very first Next resolved back to where the
 * user already was. Fix: initialize run.currentSectionId to the first
 * visible section at creation time (RunService.createRun /
 * createAnonymousRun), so the first Next advances FROM it.
 */
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import { runWithTenantContext } from '../../server/utils/rlsContext';
import { versionService } from '../../server/services/VersionService';
import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';

describe.sequential('ICW2-B9: first /next on a fresh run', () => {
  let ctx: IntegrationTestContext;
  let factory: TestFactory;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'ICW2-B9 first-next',
      createProject: true,
    });
    factory = new TestFactory();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  async function getRunRow(runId: string): Promise<typeof schema.workflowRuns.$inferSelect> {
    const [row] = await db
      .select()
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, runId));
    return row;
  }

  it('initializes currentSectionId to the first visible section at creation, and the first /next advances past it', async () => {
    const { workflow } = await factory.createWorkflow(ctx.projectId!, ctx.userId);
    const firstSection = await factory.createSection(workflow.id, { title: 'First', order: 0 });
    const secondSection = await factory.createSection(workflow.id, { title: 'Second', order: 1 });
    await factory.createStep(firstSection.id, {
      title: 'Q1', alias: 'q1', required: false, order: 0,
    });
    await factory.createStep(secondSection.id, {
      title: 'Q2', alias: 'q2', required: false, order: 0,
    });

    const createResponse = await request(ctx.baseURL)
      .post(`/api/workflows/${workflow.id}/runs`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({})
      .expect(201);

    const runId = createResponse.body.data.runId as string;
    const runToken = createResponse.body.data.runToken as string;

    // Creation response and the persisted row both reflect the resolved
    // starting section — not null.
    expect(createResponse.body.data.currentSectionId).toBe(firstSection.id);
    const createdRow = await getRunRow(runId);
    expect(createdRow.currentSectionId).toBe(firstSection.id);

    // AC1: the very first POST /next advances FROM the first section to the
    // next visible section (nextSectionId !== currentSectionId).
    // /next authenticates via the run's own bearer token (creatorOrRunTokenAuth
    // falls back to run-token auth when no upstream session middleware has set
    // req.userId on this route).
    const nextResponse = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/next`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({})
      .expect(200);

    expect(nextResponse.body.data.nextSectionId).toBe(secondSection.id);
    expect(nextResponse.body.data.nextSectionId).not.toBe(createdRow.currentSectionId);

    const afterNextRow = await getRunRow(runId);
    expect(afterNextRow.currentSectionId).toBe(secondSection.id);
  });

  it('resolves nextSectionId to null on the first /next when the workflow has only one visible section', async () => {
    const { workflow } = await factory.createWorkflow(ctx.projectId!, ctx.userId);
    const onlySection = await factory.createSection(workflow.id, { title: 'Only', order: 0 });
    await factory.createStep(onlySection.id, {
      title: 'Q1', alias: 'q1', required: false, order: 0,
    });

    const createResponse = await request(ctx.baseURL)
      .post(`/api/workflows/${workflow.id}/runs`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({})
      .expect(201);
    const runId = createResponse.body.data.runId as string;
    const runToken = createResponse.body.data.runToken as string;
    expect(createResponse.body.data.currentSectionId).toBe(onlySection.id);

    const nextResponse = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/next`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({})
      .expect(200);

    expect(nextResponse.body.data.nextSectionId).toBeNull();
  });

  it('initializes currentSectionId for anonymous runs created via the public link too', async () => {
    const { workflow, version } = await factory.createWorkflow(ctx.projectId!, ctx.userId, {
      workflow: { status: 'active', isPublic: true },
    });
    const firstSection = await factory.createSection(workflow.id, { title: 'First', order: 0 });
    const secondSection = await factory.createSection(workflow.id, { title: 'Second', order: 1 });
    await factory.createStep(firstSection.id, {
      title: 'Q1', alias: 'q1', required: false, order: 0,
    });
    await factory.createStep(secondSection.id, {
      title: 'Q2', alias: 'q2', required: false, order: 0,
    });
    // Anonymous run creation requires a published version to pin to, and
    // RVP-2 now actually resolves the run's start section from that pinned
    // graph -- so it must reflect the sections just created above, not the
    // empty snapshot `factory.createWorkflow` produced before they existed.
    // RLS-2e: called directly, not over HTTP, so no `rlsContext` middleware has
    // populated the async tenant context the converted service now requires.
    const publishedVersion = (await runWithTenantContext(ctx.tenantId, () =>
      versionService.createDraftVersion(workflow.id, ctx.userId))) ?? version;
    await db
      .update(schema.workflows)
      .set({ currentVersionId: publishedVersion.id })
      .where(eq(schema.workflows.id, workflow.id));

    const createResponse = await request(ctx.baseURL)
      .post(`/api/workflows/public/${workflow.publicLink}/start`)
      .send({})
      .expect(201);

    const runId = createResponse.body.data.runId as string;
    const createdRow = await getRunRow(runId);
    expect(createdRow.currentSectionId).toBe(firstSection.id);
  });
});
