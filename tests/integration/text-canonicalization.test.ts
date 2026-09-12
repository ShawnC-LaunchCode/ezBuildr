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

describe.sequential('STB-3 canonical text vertical path', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pageId: string;
  let shortStepId: string;
  let longStepId: string;
  let foreignTenantId: string;
  let foreignToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'STB-3 canonical text',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const workflow = await agent
      .post('/api/workflows')
      .send({ title: `Text workflow ${nanoid()}`, projectId: ctx.projectId })
      .expect(201);
    workflowId = workflow.body.id as string;

    const page = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: 'Text answers' })
      .expect(201);
    pageId = page.body.id as string;

    const [foreignTenant] = await getOwnerDb()
      .insert(schema.tenants)
      .values({ name: `STB-3 foreign ${nanoid()}`, plan: 'pro' })
      .returning();
    foreignTenantId = foreignTenant.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });

  it('creates and edits both presets through canonical text config only', async () => {
    const short = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'text',
        title: 'Short answer',
        alias: 'shortAnswer',
        required: true,
        defaultValue: 'Default short',
        config: {
          variant: 'short',
          placeholder: 'Short placeholder',
          validation: { minLength: 3, maxLength: 20 },
        },
      })
      .expect(201);
    shortStepId = short.body.id as string;

    const long = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'text',
        title: 'Long answer',
        alias: 'longAnswer',
        config: {
          variant: 'long',
          placeholder: 'Long placeholder',
          validation: { maxLength: 200, pattern: '^Details:' },
        },
      })
      .expect(201);
    longStepId = long.body.id as string;

    expect(short.body).toMatchObject({
      type: 'text',
      defaultValue: 'Default short',
      config: {
        variant: 'short',
        placeholder: 'Short placeholder',
        validation: { minLength: 3, maxLength: 20 },
      },
    });
    expect(long.body).toMatchObject({
      type: 'text',
      config: {
        variant: 'long',
        placeholder: 'Long placeholder',
        validation: { maxLength: 200, pattern: '^Details:' },
      },
    });

    const update = await agent
      .put(`/api/steps/${shortStepId}`)
      .send({
        config: {
          variant: 'short',
          placeholder: 'Edited placeholder',
          validation: { minLength: 3, maxLength: 20 },
        },
      })
      .expect(200);
    expect(update.body).toMatchObject({
      type: 'text',
      defaultValue: 'Default short',
      config: {
        variant: 'short',
        placeholder: 'Edited placeholder',
        validation: { minLength: 3, maxLength: 20 },
      },
    });
  });

  it('denies cross-tenant create and update attempts without writing', async () => {
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    const originalShort = before.find((step) => step.id === shortStepId);

    const createResponse = await request(ctx.baseURL)
      .post(`/api/pages/${pageId}/steps`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ type: 'text', title: 'Foreign text', config: { variant: 'short' } });
    expectCrossTenantDenied(createResponse.status);

    const updateResponse = await request(ctx.baseURL)
      .put(`/api/steps/${shortStepId}`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ config: { variant: 'long', placeholder: 'Foreign overwrite' } });
    expectCrossTenantDenied(updateResponse.status);

    const after = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    expect(after).toHaveLength(before.length);
    expect(after.find((step) => step.id === shortStepId)).toEqual(originalShort);
  });

  it('validates and stores both string answers through page submission', async () => {
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
          { stepId: shortStepId, value: 'x' },
          { stepId: longStepId, value: 'Missing prefix' },
        ],
      })
      .expect(400);
    expect(invalid.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(invalid.body.errors[0]).toContain('Invalid step values');

    const afterInvalid = await getOwnerDb()
      .select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));
    expect(afterInvalid).toHaveLength(1);
    expect(afterInvalid[0]).toMatchObject({ stepId: shortStepId, value: 'Default short' });
    expect(afterInvalid.find((value) => value.stepId === longStepId)).toBeUndefined();

    const valid = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({
        values: [
          { stepId: shortStepId, value: 'Ada' },
          { stepId: longStepId, value: 'Details: canonical long answer' },
        ],
      })
      .expect(200);
    expect(valid.body.success).toBe(true);

    const saved = await getOwnerDb()
      .select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));
    expect(saved).toHaveLength(2);
    expect(saved.find((value) => value.stepId === shortStepId)?.value).toBe('Ada');
    expect(saved.find((value) => value.stepId === longStepId)?.value).toBe('Details: canonical long answer');
  });
});
