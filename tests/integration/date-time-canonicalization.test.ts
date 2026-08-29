import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { expectCrossTenantDenied } from '../helpers/expectDenied';
import { getOwnerDb } from '../helpers/ownerDb';

describe.sequential('STB-4 canonical date_time vertical path', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pageId: string;
  let dateStepId: string;
  let timeStepId: string;
  let dateTimeStepId: string;
  let foreignTenantId: string;
  let foreignToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'STB-4 canonical date time',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const workflow = await agent
      .post('/api/workflows')
      .send({ title: `Date time workflow ${nanoid()}`, projectId: ctx.projectId })
      .expect(201);
    workflowId = workflow.body.id as string;

    const page = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: 'Date and time answers' })
      .expect(201);
    pageId = page.body.id as string;

    const [foreignTenant] = await getOwnerDb()
      .insert(schema.tenants)
      .values({ name: `STB-4 foreign ${nanoid()}`, plan: 'pro' })
      .returning();
    foreignTenantId = foreignTenant.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });

  it('creates and edits all three presets through canonical date_time config only', async () => {
    const date = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'date_time',
        title: 'Hearing date',
        alias: 'hearingDate',
        required: true,
        config: {
          kind: 'date',
          minDate: '2026-01-01',
          maxDate: '2026-12-31',
          defaultToToday: false,
        },
      })
      .expect(201);
    dateStepId = date.body.id as string;

    const time = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'date_time',
        title: 'Hearing time',
        alias: 'hearingTime',
        required: true,
        config: { kind: 'time', timeFormat: '24h', timeStep: 5 },
      })
      .expect(201);
    timeStepId = time.body.id as string;

    const dateTime = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'date_time',
        title: 'Filed at',
        alias: 'filedAt',
        required: true,
        config: {
          kind: 'datetime',
          minDate: '2026-01-01',
          maxDate: '2026-12-31',
          timeFormat: '12h',
          timeStep: 15,
        },
      })
      .expect(201);
    dateTimeStepId = dateTime.body.id as string;

    expect([date.body, time.body, dateTime.body]).toEqual([
      expect.objectContaining({ type: 'date_time', config: expect.objectContaining({ kind: 'date' }) }),
      expect.objectContaining({ type: 'date_time', config: expect.objectContaining({ kind: 'time' }) }),
      expect.objectContaining({ type: 'date_time', config: expect.objectContaining({ kind: 'datetime' }) }),
    ]);

    const update = await agent
      .put(`/api/steps/${dateStepId}`)
      .send({
        config: {
          kind: 'date',
          minDate: '2026-02-01',
          maxDate: '2026-12-31',
          defaultToToday: false,
        },
      })
      .expect(200);
    expect(update.body).toMatchObject({
      type: 'date_time',
      config: { kind: 'date', minDate: '2026-02-01', maxDate: '2026-12-31' },
    });
  });

  it('denies tenant B from updating tenant A canonical date config', async () => {
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, dateStepId));
    const response = await request(ctx.baseURL)
      .put(`/api/steps/${dateStepId}`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ config: { kind: 'time', timeFormat: '24h', timeStep: 1 } });
    expectCrossTenantDenied(response.status);

    const after = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, dateStepId));
    expect(after).toEqual(before);
  });

  it('validates, persists, and restores canonical strings for all three kinds', async () => {
    const createRun = await agent
      .post(`/api/workflows/${workflowId}/runs`)
      .send({})
      .expect(201);
    const runId = createRun.body.data.runId as string;
    const runToken = createRun.body.data.runToken as string;

    const invalid = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({
        values: [
          { stepId: dateStepId, value: '2026-08-28' },
          { stepId: timeStepId, value: '2:30 PM' },
          { stepId: dateTimeStepId, value: '2026-08-28T14:30' },
        ],
      })
      .expect(400);
    expect(invalid.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });

    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({
        values: [
          { stepId: dateStepId, value: '2026-08-28' },
          { stepId: timeStepId, value: '14:30' },
          { stepId: dateTimeStepId, value: '2026-08-28T14:30' },
        ],
      })
      .expect(200);

    const runtime = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set('Authorization', `Bearer ${runToken}`)
      .expect(200);
    expect(runtime.body.data.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: dateStepId, type: 'date_time', config: expect.objectContaining({ kind: 'date' }) }),
      expect.objectContaining({ id: timeStepId, type: 'date_time', config: expect.objectContaining({ kind: 'time' }) }),
      expect.objectContaining({ id: dateTimeStepId, type: 'date_time', config: expect.objectContaining({ kind: 'datetime' }) }),
    ]));
    expect(runtime.body.data.values).toEqual(expect.arrayContaining([
      expect.objectContaining({ runId, stepId: dateStepId, value: '2026-08-28' }),
      expect.objectContaining({ runId, stepId: timeStepId, value: '14:30' }),
      expect.objectContaining({ runId, stepId: dateTimeStepId, value: '2026-08-28T14:30' }),
    ]));
  });
});
