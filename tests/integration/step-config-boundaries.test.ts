import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { expectCrossTenantDenied } from '../helpers/expectDenied';
import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';

describe.sequential('STB-17 HTTP step config boundaries', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pageId: string;
  let stepId: string;
  let foreignTenantId: string;
  let foreignToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'STB-17 strict configs',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const workflow = await agent
      .post('/api/workflows')
      .send({ title: `Strict config ${nanoid()}`, projectId: ctx.projectId })
      .expect(201);
    workflowId = workflow.body.id as string;

    const page = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: 'Questions' })
      .expect(201);
    pageId = page.body.id as string;

    const step = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'text',
        title: 'Canonical text',
        config: { variant: 'short', validation: { minLength: 1 } },
      })
      .expect(201);
    stepId = step.body.id as string;

    const [foreignTenant] = await getOwnerDb()
      .insert(schema.tenants)
      .values({ name: `STB-17 foreign ${nanoid()}`, plan: 'pro' })
      .returning();
    foreignTenantId = foreignTenant.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });

  async function markWorkflowActive(): Promise<void> {
    await getOwnerDb()
      .update(schema.workflows)
      .set({ status: 'active' })
      .where(eq(schema.workflows.id, workflowId));
  }

  async function expectWorkflowStillActive(): Promise<void> {
    const [workflow] = await getOwnerDb()
      .select({ status: schema.workflows.status })
      .from(schema.workflows)
      .where(eq(schema.workflows.id, workflowId));
    expect(workflow?.status).toBe('active');
  }

  it('rejects an unknown create key with type/path and performs no write', async () => {
    await markWorkflowActive();
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));

    const response = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'text',
        title: 'Unknown nested key',
        config: { variant: 'short', validation: { minLength: 1, retiredRule: true } },
      })
      .expect(400);

    expect(response.body.message).toContain("step type 'text'");
    expect(response.body.message).toContain('config.validation.retiredRule');
    expect(await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId)))
      .toHaveLength(before.length);
    await expectWorkflowStillActive();
  });

  it('rejects a retired create type and performs no write', async () => {
    await markWorkflowActive();
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));

    const response = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({ type: 'short_text', title: 'Retired type' })
      .expect(400);

    expect(response.body.message).toContain('short_text');
    expect(response.body.message).toContain('type');
    expect(await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId)))
      .toHaveLength(before.length);
    await expectWorkflowStillActive();
  });

  it('rejects an unknown update key without changing the row', async () => {
    await markWorkflowActive();
    const [before] = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, stepId));

    const response = await agent
      .put(`/api/steps/${stepId}`)
      .send({ config: { variant: 'long', removedPlaceholderMode: true } })
      .expect(400);

    expect(response.body.message).toContain("step type 'text'");
    expect(response.body.message).toContain('config.removedPlaceholderMode');
    const [after] = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, stepId));
    expect(after).toEqual(before);
    await expectWorkflowStillActive();
  });

  it('rejects a type-only update and preserves the original pair', async () => {
    await markWorkflowActive();
    const [before] = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, stepId));

    await agent
      .put(`/api/steps/${stepId}`)
      .send({ type: 'date_time' })
      .expect(400);

    const [after] = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.id, stepId));
    expect(after).toEqual(before);
    await expectWorkflowStillActive();
  });

  it('updates type and valid replacement config together', async () => {
    const response = await agent
      .put(`/api/steps/${stepId}`)
      .send({ type: 'date_time', config: { kind: 'datetime', timeFormat: '24h', timeStep: 5 } })
      .expect(200);

    expect(response.body).toMatchObject({
      type: 'date_time',
      config: { kind: 'datetime', timeFormat: '24h', timeStep: 5 },
    });
  });

  it('conceals cross-tenant create/update and writes nothing', async () => {
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    const original = before.find(step => step.id === stepId);

    const createResponse = await request(ctx.baseURL)
      .post(`/api/pages/${pageId}/steps`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ type: 'text', title: 'Foreign create', config: { variant: 'short', invented: true } });
    expectCrossTenantDenied(createResponse.status);

    const updateResponse = await request(ctx.baseURL)
      .put(`/api/steps/${stepId}`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ config: { kind: 'date' } });
    expectCrossTenantDenied(updateResponse.status);

    const after = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    expect(after).toHaveLength(before.length);
    expect(after.find(step => step.id === stepId)).toEqual(original);
  });
});
