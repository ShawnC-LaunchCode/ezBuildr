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

describe.sequential('STB-13 canonical phone, email, website vertical path', () => {
  let ctx: IntegrationTestContext;
  let agent: ReturnType<typeof createAuthenticatedAgent>;
  let workflowId: string;
  let pageId: string;
  let phoneStepId: string;
  let emailStepId: string;
  let websiteStepId: string;
  let foreignTenantId: string;
  let foreignToken: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'STB-13 canonical types',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
    agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);

    const workflow = await agent
      .post('/api/workflows')
      .send({ title: `Contact workflow ${nanoid()}`, projectId: ctx.projectId })
      .expect(201);
    workflowId = workflow.body.id as string;

    const page = await agent
      .post(`/api/workflows/${workflowId}/pages`)
      .send({ title: 'Contact info' })
      .expect(201);
    pageId = page.body.id as string;

    const [foreignTenant] = await getOwnerDb()
      .insert(schema.tenants)
      .values({ name: `STB-13 foreign ${nanoid()}`, plan: 'pro' })
      .returning();
    foreignTenantId = foreignTenant.id;
    foreignToken = (await createTestUser(ctx, 'owner', foreignTenantId)).token;
  });

  afterAll(async () => {
    await getOwnerDb().delete(schema.users).where(eq(schema.users.tenantId, foreignTenantId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, foreignTenantId));
    await ctx.cleanup();
  });

  it('creates and edits steps through canonical configs only', async () => {
    const phone = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'phone',
        title: 'Phone Number',
        alias: 'phoneInput',
        config: {
          format: 'US',
          validation: { strict: true }
        },
      })
      .expect(201);
    phoneStepId = phone.body.id as string;

    const email = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'email',
        title: 'Email Address',
        alias: 'emailInput',
        config: {
          restrictDomains: ['example.com']
        },
      })
      .expect(201);
    emailStepId = email.body.id as string;

    const website = await agent
      .post(`/api/pages/${pageId}/steps`)
      .send({
        type: 'website',
        title: 'Website URL',
        alias: 'websiteInput',
        config: {
          requireProtocol: true
        },
      })
      .expect(201);
    websiteStepId = website.body.id as string;

    expect(phone.body).toMatchObject({
      type: 'phone',
      config: { format: 'US', validation: { strict: true } },
    });
    
    // Update phone to test update path
    const update = await agent
      .put(`/api/steps/${phoneStepId}`)
      .send({
        config: {
          format: 'international',
          placeholder: 'Edited phone',
        },
      })
      .expect(200);
    expect(update.body).toMatchObject({
      type: 'phone',
      config: { format: 'international', placeholder: 'Edited phone' },
    });
  });

  it('denies cross-tenant create and update attempts without writing', async () => {
    const before = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    const originalPhone = before.find((step) => step.id === phoneStepId);

    const createResponse = await request(ctx.baseURL)
      .post(`/api/pages/${pageId}/steps`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ type: 'phone', title: 'Foreign phone', config: { format: 'US' } });
    expectCrossTenantDenied(createResponse.status);

    const updateResponse = await request(ctx.baseURL)
      .put(`/api/steps/${phoneStepId}`)
      .set('Authorization', `Bearer ${foreignToken}`)
      .send({ config: { format: 'national', placeholder: 'Foreign overwrite' } });
    expectCrossTenantDenied(updateResponse.status);

    const after = await getOwnerDb().select().from(schema.steps).where(eq(schema.steps.pageId, pageId));
    expect(after).toHaveLength(before.length);
    expect(after.find((step) => step.id === phoneStepId)).toEqual(originalPhone);
  });

  it('validates and stores answers through page submission', async () => {
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
          { stepId: phoneStepId, value: 123 },
          { stepId: emailStepId, value: 456 },
        ],
      })
      .expect(400);
    expect(invalid.body).toMatchObject({ success: false, code: 'VALIDATION_ERROR' });

    const valid = await request(ctx.baseURL)
      .post(`/api/runs/${runId}/pages/${pageId}/submit`)
      .set('Authorization', `Bearer ${runToken}`)
      .send({
        values: [
          { stepId: phoneStepId, value: '+15551234567' },
          { stepId: emailStepId, value: 'test@example.com' },
          { stepId: websiteStepId, value: 'https://example.com' },
        ],
      })
      .expect(200);
    expect(valid.body.success).toBe(true);

    const saved = await getOwnerDb()
      .select()
      .from(schema.stepValues)
      .where(eq(schema.stepValues.runId, runId));
    
    expect(saved.find((value) => value.stepId === phoneStepId)?.value).toBe('+15551234567');
    expect(saved.find((value) => value.stepId === emailStepId)?.value).toBe('test@example.com');
    expect(saved.find((value) => value.stepId === websiteStepId)?.value).toBe('https://example.com');
  });
});
