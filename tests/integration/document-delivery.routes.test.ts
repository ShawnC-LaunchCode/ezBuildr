import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import {
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe.sequential('document delivery tenant isolation', () => {
  let ctx: IntegrationTestContext;
  let otherTenantId: string;
  let otherTenantToken: string;
  let runId: string;
  let deliveryId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Document delivery integration',
      createProject: true,
    });

    const factory = new TestFactory();
    const { workflow } = await factory.createWorkflow(ctx.projectId!, ctx.userId, {
      workflow: {
        ownerType: 'user',
        ownerUuid: ctx.userId,
      },
    });

    const [run] = await getOwnerDb().insert(schema.workflowRuns).values({
      workflowId: workflow.id,
      runToken: `delivery-${randomUUID()}`,
      createdBy: `creator:${ctx.userId}`,
      ownerType: 'user',
      ownerUuid: ctx.userId,
    }).returning();
    runId = run.id;

    const [delivery] = await getOwnerDb().insert(schema.runDocumentDeliveries).values({
      runId,
      workflowId: workflow.id,
      tenantId: ctx.tenantId,
      destinationType: 'webhook',
      destinationConfig: {
        type: 'webhook',
        url: 'https://example.com/delivery',
        secret: 'encrypted-secret-value',
        headers: { Authorization: 'encrypted-header-value' },
      },
      status: 'failed',
      lastError: 'Provider unavailable',
    }).returning();
    deliveryId = delivery.id;

    const [otherTenant] = await getOwnerDb().insert(schema.tenants).values({
      name: `Other delivery tenant ${randomUUID()}`,
      plan: 'pro',
    }).returning();
    otherTenantId = otherTenant.id;

    const otherUser = await createTestUser(ctx, 'owner', otherTenantId);
    otherTenantToken = otherUser.token;
  });

  afterAll(async () => {
    if (otherTenantId) {
      await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
    }
    await ctx.cleanup();
  });

  it('returns sanitized delivery records to the owning tenant', async () => {
    const response = await request(ctx.baseURL)
      .get(`/api/tenants/${ctx.tenantId}/runs/${runId}/deliveries`)
      .set('Authorization', `Bearer ${ctx.authToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      id: deliveryId,
      runId,
      tenantId: ctx.tenantId,
      status: 'failed',
    });
    expect(response.body[0].destinationConfig).not.toHaveProperty('secret');
    expect(response.body[0].destinationConfig.headers).toEqual({
      Authorization: '••••••••',
    });
  });

  it('denies a different tenant that supplies the owning run id', async () => {
    const response = await request(ctx.baseURL)
      .get(`/api/tenants/${otherTenantId}/runs/${runId}/deliveries`)
      .set('Authorization', `Bearer ${otherTenantToken}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Access denied');
  });

  it('denies a different tenant that supplies the delivery id directly', async () => {
    const response = await request(ctx.baseURL)
      .get(`/api/tenants/${otherTenantId}/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${otherTenantToken}`);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Document delivery not found');
  });
});
