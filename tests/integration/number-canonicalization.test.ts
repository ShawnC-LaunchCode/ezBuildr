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
 * STB-9 vertical proof: preset -> canonical config -> submit -> numeric value.
 *
 * The point of this suite is that display settings never reach storage. A step
 * configured with grouping, a prefix and a suffix must still persist a bare
 * `number`, and the server -- not the client -- must be the thing enforcing
 * limits and precision.
 */
describe.sequential('STB-9 canonical number vertical path', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pageId: string;
  let decoratedStepId: string;
  let preciseStepId: string;
  let foreignTenantId: string;
  let foreignToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'STB-9 canonical number',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const workflow = await agent
      .post('/api/workflows')
      .send({ title: `Number workflow ${nanoid()}`, projectId: ctx.projectId })
      .expect(201);
    workflowId = workflow.body.id as string;

    const page = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: 'Number answers' })
      .expect(201);
    pageId = page.body.id as string;

    const [foreignTenant] = await getOwnerDb()
      .insert(schema.tenants)
      .values({ name: `STB-9 foreign ${nanoid()}`, plan: 'pro' })
      .returning();
    foreignTenantId = foreignTenant.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });

  it('persists the canonical config, decorations and all', async () => {
    const decorated = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'number',
        title: 'Quantity',
        alias: 'quantity',
        required: true,
        config: {
          mode: 'number',
          validation: { min: 10, max: 1000, step: 1, precision: 0 },
          thousandsSeparator: true,
          formatOnInput: true,
          prefix: '#',
          suffix: 'kg',
        },
      })
      .expect(201);
    decoratedStepId = decorated.body.id as string;

    const precise = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'number',
        title: 'Ratio',
        alias: 'ratio',
        config: { mode: 'number', validation: { precision: 2 } },
      })
      .expect(201);
    preciseStepId = precise.body.id as string;

    expect(decorated.body).toMatchObject({
      type: 'number',
      config: {
        mode: 'number',
        validation: { min: 10, max: 1000, step: 1, precision: 0 },
        thousandsSeparator: true,
        formatOnInput: true,
        prefix: '#',
        suffix: 'kg',
      },
    });
  });

  it('rejects live grouping without grouping, and writes no row', async () => {
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));

    await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'number',
        title: 'Impossible',
        // formatOnInput is live grouping; without thousandsSeparator the runner
        // would have nothing to group, so the schema refuses the pair rather
        // than storing a setting that does nothing.
        config: { mode: 'number', formatOnInput: true },
      })
      .expect(400);

    const after = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    expect(after).toHaveLength(before.length);
  });

  it('denies cross-tenant create and update without writing', async () => {
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    const original = before.find((step) => step.id === decoratedStepId);

    const createResponse = await request(ctx.baseURL)
      .post(`/api/pages/${pageId}/steps`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ type: 'number', title: 'Foreign number', config: { mode: 'number' } });
    expectCrossTenantDenied(createResponse.status);

    const updateResponse = await request(ctx.baseURL)
      .put(`/api/steps/${decoratedStepId}`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ config: { mode: 'number', prefix: 'HACKED' } });
    expectCrossTenantDenied(updateResponse.status);

    const after = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    expect(after).toHaveLength(before.length);
    expect(after.find((step) => step.id === decoratedStepId)).toEqual(original);
  });

  it('stores plain numbers and enforces limits on the server', async () => {
    const createRun = await agent
      .post(`/api/workflows/${workflowId}/runs`)
      .send({})
      .expect(201);
    const runId = createRun.body.data.runId as string;
    const runToken = createRun.body.data.runToken as string;

    // Below the configured minimum: the client no longer swallows the
    // keystroke, so the server has to be the thing that refuses it.
    const invalid = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({ values: [{ stepId: decoratedStepId, value: 5 }] })
      .expect(400);
    expect(invalid.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });

    const afterInvalid = await getOwnerDb()
      .select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));
    expect(afterInvalid.find((v) => v.stepId === decoratedStepId)).toBeUndefined();

    const valid = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({
        values: [
          { stepId: decoratedStepId, value: 1000 },
          // More decimals than the field displays. Accepted, and stored
          // exactly (Decision 13).
          { stepId: preciseStepId, value: 23.148 },
        ],
      })
      .expect(200);
    expect(valid.body.success).toBe(true);

    const saved = await getOwnerDb()
      .select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));

    // Numeric storage stays numeric (Decision 8): no separators, no prefix,
    // no suffix -- none of the display settings reach the stored value.
    const quantity = saved.find((v) => v.stepId === decoratedStepId)?.value;
    expect(quantity).toBe(1000);
    expect(String(quantity)).not.toContain(',');
    expect(String(quantity)).not.toContain('#');
    expect(String(quantity)).not.toContain('kg');

    // `precision` is display-only (Decision 13). A pay rate of 23.148 is the
    // respondent's real number and is stored whole; rounding it here would
    // silently corrupt the base of every formula the author later runs on it.
    // A displayed 23.15 and a stored 23.148 are both correct, and different.
    const ratio = saved.find((v) => v.stepId === preciseStepId)?.value;
    expect(ratio).toBe(23.148);
    expect(ratio).not.toBe(23.15);
  });
});
