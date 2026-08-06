import { describe, expect, it, vi } from 'vitest';

import type { ResolvedConnection } from '../../../shared/types';
import { ClioIntegrationService } from '../../../server/services/integrations/ClioIntegrationService';
import { LegalIntegrationError } from '../../../server/services/integrations/errors';

function resolvedClio(overrides: Partial<ResolvedConnection> = {}): ResolvedConnection {
  return {
    connection: {
      id: 'connection-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      name: 'Clio Manage',
      type: 'oauth2_3leg',
      baseUrl: 'https://app.clio.com',
      authConfig: { provider: 'clio' },
      secretRefs: {},
      defaultHeaders: {},
      timeoutMs: 8000,
      retries: 2,
      backoffMs: 250,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    secrets: {},
    accessToken: 'clio-access-token',
    ...overrides,
  };
}

describe('ClioIntegrationService', () => {
  it('creates a Clio contact with the authorized regional API connection', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: 42, name: 'Ada Lovelace', primary_email_address: 'ada@example.com' },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    const markUsed = vi.fn().mockResolvedValue(undefined);
    const service = new ClioIntegrationService({
      resolve: vi.fn().mockResolvedValue(resolvedClio()),
      request,
      markUsed,
    });

    const result = await service.createContact('project-1', 'connection-1', {
      type: 'Person',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
    });

    expect(result).toEqual({ id: 42, name: 'Ada Lovelace', primaryEmailAddress: 'ada@example.com' });
    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://app.clio.com/api/v4/contacts.json');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer clio-access-token' });
    expect(JSON.parse(init.body as string)).toEqual({
      data: {
        type: 'Person',
        first_name: 'Ada',
        last_name: 'Lovelace',
        email_addresses: [{ name: 'Work', address: 'ada@example.com', default_email: true }],
      },
    });
    expect(markUsed).toHaveBeenCalledWith('connection-1');
  });

  it('files a document as multipart data under the selected matter', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: 88, name: 'engagement.pdf' },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    const service = new ClioIntegrationService({
      resolve: vi.fn().mockResolvedValue(resolvedClio()),
      request,
      markUsed: vi.fn().mockResolvedValue(undefined),
    });

    await expect(service.fileMatterDocument('project-1', 'connection-1', {
      matterId: 314,
      fileName: 'engagement.pdf',
      contentType: 'application/pdf',
      contentBase64: Buffer.from('pdf-data').toString('base64'),
    })).resolves.toEqual({ id: 88, name: 'engagement.pdf', matterId: 314 });

    const [, init] = request.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    const metadata = form.get('data');
    expect(metadata).toBeInstanceOf(Blob);
    await expect((metadata as Blob).text()).resolves.toBe(JSON.stringify({
      name: 'engagement.pdf',
      parent: { id: 314, type: 'Matter' },
    }));
    const file = form.get('file');
    expect(file).toBeInstanceOf(Blob);
    expect((file as Blob).type).toBe('application/pdf');
  });

  it('returns an actionable error without leaking the provider response', async () => {
    const request = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'secret provider diagnostics' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    ));
    const service = new ClioIntegrationService({
      resolve: vi.fn().mockResolvedValue(resolvedClio()),
      request,
      markUsed: vi.fn().mockResolvedValue(undefined),
    });

    const promise = service.createContact('project-1', 'connection-1', {
      type: 'Company',
      name: 'Example LLP',
    });
    await expect(promise).rejects.toMatchObject({
      statusCode: 502,
      code: 'clio_request_failed',
      message: 'Clio rejected the saved credentials. Reconnect the integration and try again.',
    });
    await expect(promise).rejects.not.toThrow('secret provider diagnostics');
  });

  it('requires OAuth authorization before executing Clio actions', async () => {
    const service = new ClioIntegrationService({
      resolve: vi.fn().mockResolvedValue(resolvedClio({ accessToken: undefined })),
      request: vi.fn(),
      markUsed: vi.fn(),
    });

    await expect(service.createContact('project-1', 'connection-1', {
      type: 'Company',
      name: 'Example LLP',
    })).rejects.toBeInstanceOf(LegalIntegrationError);
  });
});
