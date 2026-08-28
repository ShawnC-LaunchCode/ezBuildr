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

describe.sequential('STB-5 canonical Boolean vertical path', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pageId: string;
  let yesNoStepId: string;
  let trueFalseStepId: string;
  let foreignTenantId: string;
  let foreignToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'STB-5 canonical Boolean',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const workflow = await agent
      .post('/api/workflows')
      .send({ title: `Boolean workflow ${nanoid()}`, projectId: ctx.projectId })
      .expect(201);
    workflowId = workflow.body.id as string;

    const page = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: 'Boolean answers' })
      .expect(201);
    pageId = page.body.id as string;

    const [foreignTenant] = await getOwnerDb()
      .insert(schema.tenants)
      .values({ name: `STB-5 foreign ${nanoid()}`, plan: 'pro' })
      .returning();
    foreignTenantId = foreignTenant.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });

  it('creates both friendly presets as canonical Boolean configs and edits style without changing type', async () => {
    const yesNo = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'boolean',
        title: 'Approve request?',
        alias: 'approved',
        required: true,
        config: {
          trueLabel: 'Yes',
          falseLabel: 'No',
          storeAsBoolean: true,
          displayStyle: 'buttons',
        },
      })
      .expect(201);
    yesNoStepId = yesNo.body.id as string;

    const trueFalse = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'boolean',
        title: 'Statement is accurate',
        alias: 'accurate',
        config: {
          trueLabel: 'True',
          falseLabel: 'False',
          storeAsBoolean: true,
          displayStyle: 'buttons',
        },
      })
      .expect(201);
    trueFalseStepId = trueFalse.body.id as string;

    expect(yesNo.body).toMatchObject({
      type: 'boolean',
      config: {
        trueLabel: 'Yes', falseLabel: 'No', storeAsBoolean: true, displayStyle: 'buttons',
      },
    });
    expect(trueFalse.body).toMatchObject({
      type: 'boolean',
      config: {
        trueLabel: 'True', falseLabel: 'False', storeAsBoolean: true, displayStyle: 'buttons',
      },
    });

    const update = await agent
      .put(`/api/steps/${trueFalseStepId}`)
      .send({
        config: {
          trueLabel: 'True',
          falseLabel: 'False',
          storeAsBoolean: true,
          displayStyle: 'toggle',
        },
      })
      .expect(200);
    expect(update.body).toMatchObject({ type: 'boolean', config: { displayStyle: 'toggle' } });
  });

  it('rejects an invalid style without creating a step', async () => {
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));

    await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'boolean',
        title: 'Invalid Boolean',
        config: {
          trueLabel: 'Yes',
          falseLabel: 'No',
          storeAsBoolean: true,
          displayStyle: 'segmented',
        },
      })
      .expect(400);

    const after = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    expect(after).toHaveLength(before.length);
  });

  it('denies cross-tenant create and update attempts without writing', async () => {
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    const originalYesNo = before.find((step) => step.id === yesNoStepId);

    const createResponse = await request(ctx.baseURL)
      .post(`/api/pages/${pageId}/steps`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({
        type: 'boolean',
        title: 'Foreign Boolean',
        config: {
          trueLabel: 'Yes', falseLabel: 'No', storeAsBoolean: true, displayStyle: 'radio',
        },
      });
    expectCrossTenantDenied(createResponse.status);

    const updateResponse = await request(ctx.baseURL)
      .put(`/api/steps/${yesNoStepId}`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({
        config: {
          trueLabel: 'Foreign yes', falseLabel: 'Foreign no', storeAsBoolean: true, displayStyle: 'radio',
        },
      });
    expectCrossTenantDenied(updateResponse.status);

    const after = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    expect(after).toHaveLength(before.length);
    expect(after.find((step) => step.id === yesNoStepId)).toEqual(originalYesNo);
  });

  it('persists true and false through page submission and returns them on runtime reload', async () => {
    const createRun = await agent
      .post(`/api/workflows/${workflowId}/runs`)
      .send({})
      .expect(201);
    const runId = createRun.body.data.runId as string;
    const runToken = createRun.body.data.runToken as string;

    const submit = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({
        values: [
          { stepId: yesNoStepId, value: true },
          { stepId: trueFalseStepId, value: false },
        ],
      })
      .expect(200);
    expect(submit.body.success).toBe(true);

    const saved = await getOwnerDb()
      .select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));
    expect(saved.find((value) => value.stepId === yesNoStepId)?.value).toBe(true);
    expect(saved.find((value) => value.stepId === trueFalseStepId)?.value).toBe(false);

    const runtime = await request(ctx.baseURL)
      .get(`/api/runs/${runId}/runtime`)
      .set('Authorization', `Bearer ${runToken}`)
      .expect(200);
    expect(runtime.body.data.values).toEqual(expect.arrayContaining([
      expect.objectContaining({ runId, stepId: yesNoStepId, value: true }),
      expect.objectContaining({ runId, stepId: trueFalseStepId, value: false }),
    ]));
  });
});
