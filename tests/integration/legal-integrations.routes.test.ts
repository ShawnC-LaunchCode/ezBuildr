import crypto from 'crypto';

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditLogs, externalConnections, secrets, tenants } from '../../shared/schema';
import { decrypt } from '../../server/utils/encryption';
import {
  createAuthenticatedAgent,
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

describe('legal integrations routes', () => {
  let ctx: IntegrationTestContext;
  let stripeConnectionId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ createProject: true, projectName: 'Legal Delivery' });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('configures Stripe with encrypted credentials and exposes no plaintext', async () => {
    const agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
    const response = await agent
      .post(`/api/projects/${ctx.projectId}/integrations/stripe`)
      .send({
        name: 'Client Payments',
        secretKey: 'sk_test_integrationSecret123',
        webhookSecret: 'whsec_integrationSecret456',
      });

    expect(response.status).toBe(201);
    expect(response.body.integration).toMatchObject({
      provider: 'stripe',
      name: 'Client Payments',
      status: 'configured',
    });
    stripeConnectionId = response.body.integration.id;
    expect(JSON.stringify(response.body)).not.toContain('integrationSecret');

    const storedSecrets = await getOwnerDb().select().from(secrets).where(eq(secrets.projectId, ctx.projectId!));
    expect(storedSecrets).toHaveLength(2);
    expect(storedSecrets.map((secret) => decrypt(secret.valueEnc)).sort()).toEqual([
      'sk_test_integrationSecret123',
      'whsec_integrationSecret456',
    ]);
    for (const secret of storedSecrets) {
      expect(secret.valueEnc).toMatch(/^v\d+\./);
      expect(secret.valueEnc).not.toContain('integrationSecret');
    }

    const [connection] = await getOwnerDb().select().from(externalConnections)
      .where(eq(externalConnections.id, stripeConnectionId));
    expect(connection.authConfig).toEqual({ provider: 'stripe', tokenRef: 'secretKey' });
    expect(JSON.stringify(connection)).not.toContain('integrationSecret');

    const listResponse = await agent.get(`/api/projects/${ctx.projectId}/integrations`);
    expect(listResponse.status).toBe(200);
    expect(JSON.stringify(listResponse.body)).not.toContain('integrationSecret');
    expect(listResponse.body.integrations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: stripeConnectionId,
        provider: 'stripe',
        webhookPath: `/api/integrations/stripe/webhook/${stripeConnectionId}`,
      }),
    ]));
  });

  it('accepts a valid Stripe confirmation webhook and rejects a forged signature', async () => {
    const rawBody = JSON.stringify({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_integration_123',
          status: 'succeeded',
          metadata: { project_id: ctx.projectId },
        },
      },
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac('sha256', 'whsec_integrationSecret456')
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const endpoint = `/api/integrations/stripe/webhook/${stripeConnectionId}`;

    const valid = await request(ctx.baseURL)
      .post(endpoint)
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', `t=${timestamp},v1=${signature}`)
      .send(rawBody);
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({
      received: true,
      eventType: 'payment_intent.succeeded',
      paymentIntentId: 'pi_integration_123',
      paymentStatus: 'succeeded',
    });

    const forged = await request(ctx.baseURL)
      .post(endpoint)
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', `t=${timestamp},v1=${'0'.repeat(64)}`)
      .send(rawBody);
    expect(forged.status).toBe(401);
    expect(forged.body).toMatchObject({ code: 'stripe_invalid_signature' });
  });

  it('builds a regional Clio OAuth flow and encrypts both application credentials', async () => {
    const agent = createAuthenticatedAgent(ctx.baseURL, ctx.authToken);
    const response = await agent
      .post(`/api/projects/${ctx.projectId}/integrations/clio`)
      .send({
        name: 'Firm Clio',
        clientId: 'clio-client-integration',
        clientSecret: 'clio-secret-integration',
        region: 'ca',
      });

    expect(response.status).toBe(201);
    expect(response.body.integration).toMatchObject({
      provider: 'clio',
      name: 'Firm Clio',
      status: 'needs_authorization',
    });
    expect(response.body.authorizationUrl).toMatch(/^https:\/\/ca\.app\.clio\.com\/oauth\/authorize\?/);
    expect(response.body.authorizationUrl).toContain('state=');
    expect(JSON.stringify(response.body)).not.toContain('clio-secret-integration');

    const restarted = await agent
      .post(`/api/projects/${ctx.projectId}/integrations/clio/${response.body.integration.id}/authorize`)
      .send({});
    expect(restarted.status).toBe(200);
    expect(restarted.body.authorizationUrl).toMatch(/^https:\/\/ca\.app\.clio\.com\/oauth\/authorize\?/);

    const storedSecrets = await getOwnerDb().select().from(secrets).where(eq(secrets.projectId, ctx.projectId!));
    const clioPlaintexts = storedSecrets
      .filter((secret) => (secret.metadata as { provider?: string } | null)?.provider === 'clio')
      .map((secret) => decrypt(secret.valueEnc))
      .sort();
    expect(clioPlaintexts).toEqual(['clio-client-integration', 'clio-secret-integration']);

    const duplicate = await agent
      .post(`/api/projects/${ctx.projectId}/integrations/clio`)
      .send({
        name: 'Second Clio',
        clientId: 'another-client',
        clientSecret: 'another-secret',
        region: 'us',
      });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({ code: 'clio_already_configured' });
  });

  it('denies integration metadata to a user from another tenant', async () => {
    const [otherTenant] = await getOwnerDb().insert(tenants).values({ name: 'Other Firm', plan: 'pro' }).returning();
    try {
      const otherUser = await createTestUser(ctx, 'owner', otherTenant.id);
      const denied = await request(ctx.baseURL)
        .get(`/api/projects/${ctx.projectId}/integrations`)
        .set('Authorization', `Bearer ${otherUser.token}`);
      expect(denied.status).toBe(403);
    } finally {
      await getOwnerDb().delete(auditLogs).where(eq(auditLogs.tenantId, otherTenant.id));
      await getOwnerDb().delete(tenants).where(eq(tenants.id, otherTenant.id));
    }
  });
});
