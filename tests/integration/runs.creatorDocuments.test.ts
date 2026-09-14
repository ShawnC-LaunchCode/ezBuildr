/**
 * A workflow's creator can list and download its runs' documents.
 *
 * `GET /api/runs/:id/documents` and the download route mounted only
 * `creatorOrRunTokenAuth`, which trusts `req.userId` — but nothing ahead of it
 * set one, so a creator's session was treated as a (non-existent) run token and
 * got 401. Only a respondent's run token worked, so there was no way for a
 * creator to get a run's documents back (found 2026-09-14, building the Runs tab).
 */
import fs from 'fs/promises';
import path from 'path';

import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import PizZip from 'pizzip';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { runLifecycleService } from '../../server/services/workflow-runs/RunLifecycleService';
import {
  createTestUser,
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { getOwnerDb } from '../helpers/ownerDb';
import { TestFactory } from '../helpers/testFactory';

const FILES_DIR = path.join(process.cwd(), 'server', 'files');

function createDocxBuffer(content: string): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>');
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${content}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' });
}

const asBuffer = (res: request.Response, cb: (err: Error | null, body: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe.sequential('creator access to a run\'s documents', () => {
  let ctx: IntegrationTestContext;
  let runId: string;
  let runToken: string;
  let fileName: string;
  let outsiderToken: string;
  const templateFileRefs: string[] = [];

  beforeAll(async () => {
    ctx = await setupIntegrationTest({ tenantName: 'Creator Docs', createProject: true });
    const factory = new TestFactory();
    const { workflow } = await factory.createWorkflow(ctx.projectId!, ctx.userId);
    const page = await factory.createPage(workflow.id);
    const textStep = await factory.createStep(page.id, { type: 'text', title: 'Client name', alias: 'clientName', order: 0 });

    const fileRef = `creator-docs-${Date.now()}.docx`;
    await fs.mkdir(FILES_DIR, { recursive: true });
    await fs.writeFile(path.join(FILES_DIR, fileRef), createDocxBuffer('Contract for {{clientName}}'));
    templateFileRefs.push(fileRef);
    const { template } = await factory.createTemplate(ctx.projectId!, ctx.userId, { name: 'Creator Contract', fileRef });
    await factory.createStep(page.id, {
      type: 'final_documents', title: 'Final documents', order: 1,
      config: { markdownHeader: '', documents: [{ id: 'doc-1', documentId: template.id, alias: 'contract' }] },
    });

    runToken = `creator-docs-token-${Date.now()}`;
    const [run] = await getOwnerDb().insert(schema.workflowRuns)
      .values({ workflowId: workflow.id, runToken, createdBy: `creator:${ctx.userId}` }).returning();
    runId = run.id;
    await getOwnerDb().insert(schema.stepValues).values({ runId, stepId: textStep.id, value: 'Acme Corporation' });
    const result = await runLifecycleService.generateDocuments(runId);
    expect(result.success).toBe(true);
    const [record] = await getOwnerDb().select().from(schema.runGeneratedDocuments)
      .where(eq(schema.runGeneratedDocuments.runId, runId));
    fileName = record.fileName;

    // A signed-in user in ANOTHER tenant, who must not see this run.
    const [otherTenant] = await getOwnerDb().insert(schema.tenants)
      .values({ name: `Creator Docs Outsider ${nanoid()}`, plan: 'pro' }).returning();
    outsiderToken = (await createTestUser(ctx, 'owner', otherTenant.id)).token;
  });

  afterAll(async () => {
    for (const fileRef of templateFileRefs) {
      await fs.unlink(path.join(FILES_DIR, fileRef)).catch(() => { });
    }
    await ctx.cleanup();
  });

  it("lists the run's documents with the creator's session", async () => {
    const res = await request(ctx.baseURL).get(`/api/runs/${runId}/documents`)
      .set('Authorization', `Bearer ${ctx.authToken}`);
    // Was 401: the creator's JWT was looked up as a run token.
    expect(res.status).toBe(200);
    expect(res.body.documents.map((d: { fileName: string }) => d.fileName)).toEqual([fileName]);
  });

  it("downloads a document with the creator's session", async () => {
    const res = await request(ctx.baseURL).get(`/api/runs/${runId}/final-documents/${fileName}/download`)
      .set('Authorization', `Bearer ${ctx.authToken}`).buffer(true).parse(asBuffer);
    expect(res.status).toBe(200);
    const text = (new PizZip(res.body as Buffer).file('word/document.xml')?.asText() ?? '').replace(/<[^>]+>/g, '');
    expect(text).toContain('Contract for Acme Corporation');
  });

  it("refuses a signed-in user from another tenant — listing and download", async () => {
    const list = await request(ctx.baseURL).get(`/api/runs/${runId}/documents`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect([403, 404]).toContain(list.status);

    const download = await request(ctx.baseURL).get(`/api/runs/${runId}/final-documents/${fileName}/download`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect([403, 404]).toContain(download.status);
  });

  it("still serves the respondent's run token", async () => {
    const res = await request(ctx.baseURL).get(`/api/runs/${runId}/documents`)
      .set('Authorization', `Bearer ${runToken}`);
    expect(res.status).toBe(200);
    expect(res.body.documents).toHaveLength(1);
  });
});
