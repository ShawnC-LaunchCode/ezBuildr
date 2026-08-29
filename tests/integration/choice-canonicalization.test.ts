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

/**
 * STB-7 vertical proof (added by the reviewer; the turn-in had none).
 *
 * Choice is the family where cardinality and storage shape are coupled: a
 * single-select stores a string, a multi-select stores a string[]. The point
 * of this suite is that `display` alone decides which, that layout never
 * touches storage, and that a pre-STB-7 row whose `allowMultiple` disagreed
 * with `display` still round-trips its array.
 */
describe.sequential('STB-7 canonical choice vertical path', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pageId: string;
  let singleStepId: string;
  let multiStepId: string;
  let legacyStepId: string;
  let foreignTenantId: string;
  let foreignToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'STB-7 canonical choice',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const workflow = await agent
      .post('/api/workflows')
      .send({ title: `Choice workflow ${nanoid()}`, projectId: ctx.projectId })
      .expect(201);
    workflowId = workflow.body.id as string;

    const page = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: 'Choices' })
      .expect(201);
    pageId = page.body.id as string;

    const [foreignTenant] = await getOwnerDb()
      .insert(schema.tenants)
      .values({ name: `STB-7 foreign ${nanoid()}`, plan: 'pro' })
      .returning();
    foreignTenantId = foreignTenant.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });

  const options = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
  ];

  it('creates both presets as canonical choice, with layout stored but inert to cardinality', async () => {
    const single = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'choice',
        title: 'Pick one',
        alias: 'pickOne',
        config: { display: 'radio', layout: 'horizontal', options },
      })
      .expect(201);
    singleStepId = single.body.id as string;

    const multi = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'choice',
        title: 'Pick several',
        alias: 'pickSeveral',
        config: { display: 'multiple', layout: 'vertical', options },
      })
      .expect(201);
    multiStepId = multi.body.id as string;

    expect(single.body).toMatchObject({
      type: 'choice',
      config: { display: 'radio', layout: 'horizontal' },
    });
    expect(multi.body).toMatchObject({
      type: 'choice',
      config: { display: 'multiple', layout: 'vertical' },
    });
    // The retired flag is gone from anything newly authored.
    expect(single.body.config).not.toHaveProperty('allowMultiple');
    expect(multi.body.config).not.toHaveProperty('allowMultiple');
  });

  it('rejects an invalid display and an invalid layout, writing no row', async () => {
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));

    await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({ type: 'choice', title: 'Bad display', config: { display: 'carousel', options } })
      .expect(400);

    await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({ type: 'choice', title: 'Bad layout', config: { display: 'radio', layout: 'diagonal', options } })
      .expect(400);

    const after = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    expect(after).toHaveLength(before.length);
  });

  it('denies cross-tenant create and update without writing', async () => {
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    const original = before.find((step) => step.id === singleStepId);

    const createResponse = await request(ctx.baseURL)
      .post(`/api/pages/${pageId}/steps`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ type: 'choice', title: 'Foreign choice', config: { display: 'radio', options } });
    expectCrossTenantDenied(createResponse.status);

    const updateResponse = await request(ctx.baseURL)
      .put(`/api/steps/${singleStepId}`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ config: { display: 'multiple', options } });
    expectCrossTenantDenied(updateResponse.status);

    const after = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    expect(after).toHaveLength(before.length);
    expect(after.find((step) => step.id === singleStepId)).toEqual(original);
  });

  it('persists a string for single-select and an array for multi-select', async () => {
    const createRun = await agent
      .post(`/api/workflows/${workflowId}/runs`)
      .send({})
      .expect(201);
    const runId = createRun.body.data.runId as string;
    const runToken = createRun.body.data.runToken as string;

    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({
        values: [
          { stepId: singleStepId, value: 'a' },
          { stepId: multiStepId, value: ['a', 'c'] },
        ],
      })
      .expect(200);

    const saved = await getOwnerDb()
      .select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));

    // Cardinality follows display, and the horizontal layout on the
    // single-select changed nothing about what was stored.
    expect(saved.find((v) => v.stepId === singleStepId)?.value).toBe('a');
    expect(saved.find((v) => v.stepId === multiStepId)?.value).toEqual(['a', 'c']);
  });

  it('round-trips a pre-STB-7 row whose allowMultiple disagreed with display', async () => {
    // Reachable via AI, API or import, which bypass the editor that kept the
    // two in step. Such a row is a real multi-select; reading it as a radio
    // would orphan the string[] already stored against it.
    const [legacy] = await getOwnerDb().insert(schema.steps).values({
      workflowId,
      pageId,
      type: 'choice',
      title: 'Legacy multi',
      alias: 'legacyMulti',
      order: 90,
      required: false,
      config: { display: 'radio', allowMultiple: true, options },
    }).returning();
    legacyStepId = legacy.id;

    const createRun = await agent
      .post(`/api/workflows/${workflowId}/runs`)
      .send({})
      .expect(201);
    const runId = createRun.body.data.runId as string;
    const runToken = createRun.body.data.runToken as string;

    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({
        values: [
          { stepId: singleStepId, value: 'b' },
          { stepId: multiStepId, value: ['b'] },
          { stepId: legacyStepId, value: ['a', 'b'] },
        ],
      })
      .expect(200);

    const saved = await getOwnerDb()
      .select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));
    expect(saved.find((v) => v.stepId === legacyStepId)?.value).toEqual(['a', 'b']);
  });

  it('STB-8: persists a custom string when allowOther is true', async () => {
    const singleOther = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'choice',
        title: 'Pick one other',
        alias: 'pickOneOther',
        config: { display: 'radio', allowOther: true, options },
      })
      .expect(201);
    const singleOtherStepId = singleOther.body.id as string;

    const multiOther = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'choice',
        title: 'Pick several other',
        alias: 'pickSeveralOther',
        config: { display: 'multiple', allowOther: true, options },
      })
      .expect(201);
    const multiOtherStepId = multiOther.body.id as string;

    const createRun = await agent
      .post(`/api/workflows/${workflowId}/runs`)
      .send({})
      .expect(201);
    const runId = createRun.body.data.runId as string;
    const runToken = createRun.body.data.runToken as string;

    await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({
        values: [
          { stepId: singleOtherStepId, value: 'My custom single answer' },
          { stepId: multiOtherStepId, value: ['a', 'My custom multi answer'] },
        ],
      })
      .expect(200);

    const saved = await getOwnerDb()
      .select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));

    expect(saved.find((v) => v.stepId === singleOtherStepId)?.value).toBe('My custom single answer');
    expect(saved.find((v) => v.stepId === multiOtherStepId)?.value).toEqual(['a', 'My custom multi answer']);
  });
});

