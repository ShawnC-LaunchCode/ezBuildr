/**
 * Document Mapping Workbench (GH-156) — persistence, round-trip editing,
 * cross-tenant denial, and the /preview route defaulting to the persisted
 * mapping when the caller doesn't supply one.
 *
 * Rendering itself (docx -> pdf/docx bytes) is intentionally out of scope
 * here — `templatePreviewService` is mocked, exactly like the existing
 * `templates.e2e.test.ts` does, so this proves the HTTP/persistence
 * boundary. Real binding *execution* (constant/formula/datavault resolving
 * to values) is covered at the service level in
 * `tests/unit/services/EnhancedDocumentEngine.mapping.test.ts`.
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';

const generatePreviewMock = vi.fn().mockResolvedValue({
  previewUrl: 'https://mock-storage/preview-url',
  filePath: 'previews/mock-file',
  format: 'pdf',
  size: 1024,
  expiresAt: new Date(Date.now() + 300000),
  validationReport: undefined,
});

vi.mock('../../server/services/TemplatePreviewService', () => ({
  templatePreviewService: { generatePreview: generatePreviewMock },
}));

describe.sequential('Document Mapping Workbench (GH-156)', () => {
  let ctx: IntegrationTestContext;
  let otherCtx: IntegrationTestContext;
  let templateId: string;

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Mapping Workbench Tenant',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });
    otherCtx = await setupIntegrationTest({
      tenantName: 'Foreign Mapping Workbench Tenant',
      createProject: true,
      userRole: 'admin',
      tenantRole: 'owner',
    });

    if (ctx.projectId === undefined) {
      throw new Error('Mapping Workbench tests require a project');
    }

    const factory = new TestFactory();
    const { template } = await factory.createTemplate(ctx.projectId, ctx.userId);
    templateId = template.id;
  });

  afterAll(async () => {
    await otherCtx.cleanup();
    await ctx.cleanup();
  });

  it('persists a mapping via PATCH and reads it back via GET (round-trip)', async () => {
    const mapping = {
      firm_name: { type: 'constant', value: 'Acme Legal' },
      client_name: { type: 'variable', source: 'fullName' },
    };

    const patchResponse = await request(ctx.baseURL)
      .patch(`/api/templates/${templateId}`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ mapping })
      .expect(200);
    expect(patchResponse.body.mapping).toEqual(mapping);

    const getResponse = await request(ctx.baseURL)
      .get(`/api/templates/${templateId}`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .expect(200);
    expect(getResponse.body.mapping).toEqual(mapping);
  });

  it('round-trip editing: a second save overwrites the first and both are recorded as versions', async () => {
    const v1 = { firm_name: { type: 'constant', value: 'First Save' } };
    const v2 = { firm_name: { type: 'constant', value: 'Second Save' } };

    await request(ctx.baseURL)
      .patch(`/api/templates/${templateId}`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ mapping: v1 })
      .expect(200);

    await request(ctx.baseURL)
      .patch(`/api/templates/${templateId}`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ mapping: v2 })
      .expect(200);

    const getResponse = await request(ctx.baseURL)
      .get(`/api/templates/${templateId}`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .expect(200);
    expect(getResponse.body.mapping).toEqual(v2);

    const versionsResponse = await request(ctx.baseURL)
      .get(`/api/templates/${templateId}/versions`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .expect(200);
    const versions = Array.isArray(versionsResponse.body) ? versionsResponse.body : versionsResponse.body.versions;
    // At least the two mapping saves above recorded their own version each.
    expect(versions.length).toBeGreaterThanOrEqual(2);
  });

  it('denies a mapping save from a different tenant and leaves the mapping unchanged', async () => {
    const before = await request(ctx.baseURL)
      .get(`/api/templates/${templateId}`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .expect(200);

    await request(otherCtx.baseURL)
      .patch(`/api/templates/${templateId}`)
      .set('Authorization', `Bearer ${otherCtx.authToken}`)
      .send({ mapping: { hijacked: { type: 'constant', value: 'nope' } } })
      .expect(403);

    const after = await request(ctx.baseURL)
      .get(`/api/templates/${templateId}`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .expect(200);
    expect(after.body.mapping).toEqual(before.body.mapping);
  });

  it('defaults /preview to the persisted mapping when the caller omits one', async () => {
    const persisted = { firm_name: { type: 'constant', value: 'Persisted Mapping Co' } };
    await request(ctx.baseURL)
      .patch(`/api/templates/${templateId}`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ mapping: persisted })
      .expect(200);

    generatePreviewMock.mockClear();
    await request(ctx.baseURL)
      .post(`/api/templates/${templateId}/preview`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ sampleData: {} })
      .expect(200);

    expect(generatePreviewMock).toHaveBeenCalledTimes(1);
    const call = generatePreviewMock.mock.calls[0][0] as { mapping?: unknown };
    expect(call.mapping).toEqual(persisted);
  });

  it('still honors an explicit mapping override on /preview', async () => {
    const override = { firm_name: { type: 'constant', value: 'Override Co' } };

    generatePreviewMock.mockClear();
    await request(ctx.baseURL)
      .post(`/api/templates/${templateId}/preview`)
      .set('Authorization', `Bearer ${ctx.authToken}`)
      .send({ sampleData: {}, mapping: override })
      .expect(200);

    const call = generatePreviewMock.mock.calls[0][0] as { mapping?: unknown };
    expect(call.mapping).toEqual(override);
  });
});
