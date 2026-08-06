import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DocusignProvider,
  type DocusignConfig,
  type DocusignHttpRequest,
} from '../../../server/services/esign/DocusignProvider';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const config: DocusignConfig = {
  integrationKey: 'integration-key',
  userId: 'user-id',
  accountId: 'account-id',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  basePath: 'https://demo.docusign.net/restapi',
  oauthBasePath: 'https://account-d.docusign.com',
  webhookSecret: 'webhook-secret',
};

describe('DocusignProvider', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'docusign-provider-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('uses a JWT grant, maps recipient roles/tabs, creates an envelope, and returns an embedded signing URL', async () => {
    const documentPath = path.join(tempDir, 'agreement.pdf');
    await fs.writeFile(documentPath, Buffer.from('%PDF-mocked'));
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const httpRequest: DocusignHttpRequest = async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('/oauth/token')) {
        return Response.json({ access_token: 'access-token', expires_in: 3600 });
      }
      if (url.endsWith('/envelopes')) {
        return Response.json({ envelopeId: 'env-123', status: 'sent', statusDateTime: '2026-08-06T12:00:00Z' });
      }
      if (url.endsWith('/views/recipient')) {
        return Response.json({ url: 'https://demo.docusign.net/Signing/start' });
      }
      return new Response('not found', { status: 404 });
    };
    const provider = new DocusignProvider(config, httpRequest);

    const result = await provider.createEnvelope({
      runId: 'run-1',
      stepId: 'step-1',
      documents: [{
        id: 'doc-1',
        name: 'agreement.pdf',
        filePath: documentPath,
        mimeType: 'application/pdf',
        mapping: { ClientName: { type: 'variable', source: 'clientName' } },
      }],
      signer: {
        role: 'Applicant',
        name: 'Ava Client',
        email: 'ava@example.com',
        routingOrder: 2,
        signerId: 'run-1:step-1',
      },
      variableData: { clientName: 'Ava Client' },
      returnUrl: 'https://ezbuildr.com/run/run-1',
    });

    expect(result).toMatchObject({
      envelopeId: 'env-123',
      signingUrl: 'https://demo.docusign.net/Signing/start',
      status: 'sent',
    });
    const tokenRequest = requests[0];
    const tokenParams = new URLSearchParams(String(tokenRequest?.init?.body));
    const assertion = tokenParams.get('assertion');
    expect(tokenParams.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(assertion).not.toBeNull();
    const verifiedAssertion = jwt.verify(assertion ?? '', publicKey, {
      algorithms: ['RS256'],
      audience: 'account-d.docusign.com',
      issuer: 'integration-key',
      subject: 'user-id',
    });
    expect(verifiedAssertion).toMatchObject({ scope: 'signature impersonation' });

    const envelopeBody = JSON.parse(String(requests[1]?.init?.body)) as {
      recipients: { signers: Array<{ roleName: string; routingOrder: string; tabs: { textTabs: Array<{ tabLabel: string; value: string }> } }> };
      customFields: { textCustomFields: Array<{ name: string; value: string }> };
    };
    expect(envelopeBody.recipients.signers[0]).toMatchObject({
      roleName: 'Applicant',
      routingOrder: '2',
      tabs: { textTabs: [{ tabLabel: 'ClientName', value: 'Ava Client' }] },
    });
    expect(envelopeBody.customFields.textCustomFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'ezbuildrRunId', value: 'run-1' }),
      expect.objectContaining({ name: 'ezbuildrStepId', value: 'step-1' }),
    ]));
  });

  it('verifies the exact raw webhook body and parses completed, declined, and voided events', async () => {
    const provider = new DocusignProvider(config, async () => new Response());
    const raw = Buffer.from('{ "event": "envelope-completed", "data": { "envelopeId": "env-1" } }');
    const signature = crypto.createHmac('sha256', config.webhookSecret ?? '').update(raw).digest('base64');

    await expect(provider.verifyWebhookSignature(raw, signature)).resolves.toBe(true);
    await expect(provider.verifyWebhookSignature(Buffer.from(raw.toString().replace('env-1', 'env-2')), signature)).resolves.toBe(false);
    await expect(provider.parseWebhookEvent({ event: 'envelope-completed', data: { envelopeId: 'env-1' } }))
      .resolves.toMatchObject({ type: 'completed', envelopeId: 'env-1' });
    await expect(provider.parseWebhookEvent({ event: 'envelope-declined', data: { envelopeId: 'env-1' } }))
      .resolves.toMatchObject({ type: 'declined' });
    await expect(provider.parseWebhookEvent({ event: 'envelope-voided', data: { envelopeId: 'env-1' } }))
      .resolves.toMatchObject({ type: 'voided' });
  });

  it('uses authenticated API endpoints for status, voiding, and combined signed-document retrieval', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const httpRequest: DocusignHttpRequest = async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('/oauth/token')) {
        return Response.json({ access_token: 'access-token', expires_in: 3600 });
      }
      if (url.endsWith('/documents/combined')) {
        return new Response(Buffer.from('signed-pdf'), { status: 200 });
      }
      if (init?.method === 'PUT') {
        return Response.json({ status: 'voided' });
      }
      return Response.json({ status: 'completed', completedDateTime: '2026-08-06T12:00:00Z' });
    };
    const provider = new DocusignProvider(config, httpRequest);

    await expect(provider.getEnvelopeStatus('env-1')).resolves.toMatchObject({
      envelopeId: 'env-1',
      status: 'completed',
    });
    await expect(provider.voidEnvelope('env-1', 'Client requested cancellation')).resolves.toBeUndefined();
    await expect(provider.downloadSignedDocuments('env-1')).resolves.toEqual([Buffer.from('signed-pdf')]);
    expect(requests.slice(1).every((request) =>
      new Headers(request.init?.headers).get('authorization') === 'Bearer access-token'
    )).toBe(true);
  });
});
