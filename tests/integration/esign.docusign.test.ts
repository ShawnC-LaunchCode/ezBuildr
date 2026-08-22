import crypto, { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { signatureRequestRepository } from '../../server/repositories/SignatureRequestRepository';
import {
  DocusignProvider,
  type DocusignHttpRequest,
} from '../../server/services/esign/DocusignProvider';
import { EsignProviderFactory } from '../../server/services/esign/EsignProvider';
import { storageProvider } from '../../server/services/storage';
import { hashToken } from '../../server/utils/encryption';
import {
  setupIntegrationTest,
  createTestUser,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";
import { withTenant } from '../../server/utils/rlsContext';

describe('DocuSign production lifecycle', () => {
  let ctx: IntegrationTestContext;
  let runId: string;
  let runToken: string;
  let stepId: string;
  let templateStorageKey: string;
  let otherTenantId: string;
  let otherTenantUserId: string;
  let otherTenantAuthToken: string;
  const signedStorageKeys: string[] = [];
  const webhookSecret = 'integration-webhook-secret';

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ createProject: true });
    if (!ctx.projectId) {
      throw new Error('Expected integration-test project');
    }
    const factory = new TestFactory();
    const { workflow } = await factory.createWorkflow(ctx.projectId, ctx.userId, {
      workflow: { status: 'active', isPublic: true },
    });
    const section = await factory.createSection(workflow.id);
    templateStorageKey = `tests/esign/${randomUUID()}.docx`;
    await storageProvider.uploadFile(
      templateStorageKey,
      Buffer.from('mock-docx-for-docusign'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    const { template } = await factory.createTemplate(ctx.projectId, ctx.userId, {
      fileRef: templateStorageKey,
      name: 'Engagement Agreement.docx',
    });
    const step = await factory.createStep(section.id, {
      type: 'signature_block',
      title: 'Sign agreement',
      config: {
        signerRole: 'Applicant',
        signerName: '{{clientName}}',
        signerEmail: '{{clientEmail}}',
        routingOrder: 1,
        provider: 'docusign',
        documents: [{
          id: 'agreement',
          documentId: template.id,
          mapping: { ClientName: { type: 'variable', source: 'clientName' } },
        }],
      },
    });
    stepId = step.id;
    runId = randomUUID();
    runToken = `run-token-${randomUUID()}`;
    await getOwnerDb().insert(schema.workflowRuns).values({
      id: runId,
      workflowId: workflow.id,
      runToken: hashToken(runToken),
      createdBy: 'anon',
      tokenExpiresAt: new Date(Date.now() + 3_600_000),
    });
    await getOwnerDb().insert(schema.stepValues).values([
      { runId, stepId: (await factory.createStep(section.id, { alias: 'clientName', order: 2 })).id, value: 'Ava Client' },
      { runId, stepId: (await factory.createStep(section.id, { alias: 'clientEmail', order: 3 })).id, value: 'ava@example.com' },
    ]);

    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const httpRequest: DocusignHttpRequest = async (url) => {
      if (url.endsWith('/oauth/token')) {
        return Response.json({ access_token: 'integration-access-token', expires_in: 3600 });
      }
      if (url.endsWith('/views/recipient')) {
        return Response.json({ url: 'https://demo.docusign.net/Signing/integration' });
      }
      if (url.endsWith('/documents/combined')) {
        return new Response(Buffer.from('%PDF-signed-integration'));
      }
      if (url.endsWith('/envelopes')) {
        return Response.json({ envelopeId: 'env-completed', status: 'sent' });
      }
      return Response.json({ status: 'completed' });
    };
    EsignProviderFactory.registerProvider('docusign', new DocusignProvider({
      integrationKey: 'integration-key',
      userId: 'integration-user',
      accountId: 'integration-account',
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      basePath: 'https://demo.docusign.net/restapi',
      oauthBasePath: 'https://account-d.docusign.com',
      webhookSecret,
    }, httpRequest));

    const [otherTenant] = await getOwnerDb().insert(schema.tenants).values({
      name: `Other Tenant ${randomUUID()}`,
      plan: 'pro',
    }).returning();
    otherTenantId = otherTenant.id;
    const otherUser = await createTestUser(ctx, 'owner', otherTenantId);
    otherTenantUserId = otherUser.userId;
    otherTenantAuthToken = otherUser.token;
  });

  afterAll(async () => {
    const documents = await getOwnerDb().select().from(schema.runGeneratedDocuments).where(eq(schema.runGeneratedDocuments.runId, runId));
    signedStorageKeys.push(...documents.map((document) => document.storageKey));
    await Promise.all([templateStorageKey, ...signedStorageKeys].map((key) => storageProvider.deleteFile(key)));
    await ctx.cleanup();
    await getOwnerDb().delete(schema.auditLogs).where(eq(schema.auditLogs.userId, otherTenantUserId));
    await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, otherTenantId));
  });

  async function sendWebhook(payload: Record<string, unknown>, signatureOverride?: string) {
    const rawBody = JSON.stringify(payload);
    const signature = signatureOverride
      ?? crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('base64');
    return request(ctx.baseURL)
      .post('/api/esign/webhook/docusign')
      .set('content-type', 'application/json')
      .set('x-docusign-signature-1', signature)
      .send(rawBody);
  }

  it('lets a run-token holder create a real envelope from tenant-scoped stored data', async () => {
    const response = await request(ctx.baseURL)
      .post(`/api/esign/execute/${runId}/${stepId}`)
      .set('authorization', `Bearer ${runToken}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      envelopeId: 'env-completed',
      signingUrl: 'https://demo.docusign.net/Signing/integration',
      provider: 'docusign',
    });
    const stored = await withTenant(ctx.tenantId, (tx) =>
      signatureRequestRepository.findByProviderRequestId('env-completed', tx));
    expect(stored).toMatchObject({
      runId,
      nodeId: stepId,
      tenantId: ctx.tenantId,
      signerEmail: 'ava@example.com',
      signerName: 'Ava Client',
      status: 'pending',
    });
  });

  it('denies a creator authenticated in a different tenant', async () => {
    const response = await request(ctx.baseURL)
      .post(`/api/esign/execute/${runId}/${stepId}`)
      .set('authorization', `Bearer ${otherTenantAuthToken}`)
      .send({});

    expect(response.status).toBe(403);
  });

  it('rejects a forged webhook and stores the completed signed PDF with an audit event', async () => {
    const forged = await sendWebhook({ event: 'envelope-completed', data: { envelopeId: 'env-completed' } }, 'forged');
    expect(forged.status).toBe(401);

    const response = await sendWebhook({
      event: 'envelope-completed',
      generatedDateTime: '2026-08-06T12:00:00Z',
      data: { envelopeId: 'env-completed' },
    });
    expect(response.status).toBe(200);

    const stored = await withTenant(ctx.tenantId, (tx) =>
      signatureRequestRepository.findByProviderRequestId('env-completed', tx));
    expect(stored?.status).toBe('signed');
    expect(stored?.documentUrl).toContain(`runs/${runId}/signatures/`);
    const events = await withTenant(ctx.tenantId, (tx) =>
      signatureRequestRepository.getEvents(stored?.id ?? '', tx));
    expect(events.map((event) => event.type)).toContain('completed');
    const documents = await getOwnerDb().select().from(schema.runGeneratedDocuments).where(eq(schema.runGeneratedDocuments.runId, runId));
    expect(documents).toHaveLength(1);
    expect(await storageProvider.getFile(documents[0].storageKey)).toEqual(Buffer.from('%PDF-signed-integration'));
  });

  it.each([
    ['envelope-declined', 'env-declined', 'declined'],
    ['envelope-voided', 'env-voided', 'voided'],
  ] as const)('persists %s webhook lifecycle events', async (event, envelopeId, status) => {
    const [runRow] = await getOwnerDb().select().from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, runId));
    await withTenant(ctx.tenantId, (tx) => signatureRequestRepository.create({
      runId,
      workflowId: runRow.workflowId,
      nodeId: stepId,
      tenantId: ctx.tenantId,
      projectId: ctx.projectId ?? '',
      signerEmail: 'ava@example.com',
      signerName: 'Ava Client',
      status: 'pending',
      provider: 'docusign',
      providerRequestId: envelopeId,
      token: hashToken(randomUUID()),
      expiresAt: new Date(Date.now() + 3_600_000),
    }, tx));

    const response = await sendWebhook({ event, data: { envelopeId } });
    expect(response.status).toBe(200);
    const stored = await withTenant(ctx.tenantId, (tx) =>
      signatureRequestRepository.findByProviderRequestId(envelopeId, tx));
    expect(stored?.status).toBe(status);
    const events = await withTenant(ctx.tenantId, (tx) =>
      signatureRequestRepository.getEvents(stored?.id ?? '', tx));
    expect(events.map((item) => item.type)).toContain(status);
  });
});
