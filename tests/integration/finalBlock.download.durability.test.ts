/**
 * DEBT-15 AC 5 — generated documents survive the loss of the local working
 * directory.
 *
 * Before DEBT-15 the per-run download route read the artifact straight out of
 * `process.cwd()/server/files/{archives,outputs}`. Those directories are the
 * container's own filesystem, which Railway wipes on every deploy, so a
 * customer could list their documents and then 404 on the download. The route
 * now resolves a storage key through `storageProvider` instead.
 *
 * This test deletes both generation directories between writing and reading —
 * which is what a deploy does to an in-flight artifact — and then downloads
 * over HTTP through the real endpoint. Reading the bytes back through
 * `storageProvider` in the same process would NOT prove anything: under the
 * default disk driver its baseDir is that same `server/files` root, so such a
 * test passes whether or not the coupling was ever broken.
 */
import fs from 'fs/promises';
import path from 'path';

import { eq } from 'drizzle-orm';
import PizZip from 'pizzip';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import { runLifecycleService } from '../../server/services/workflow-runs/RunLifecycleService';
import {
  setupIntegrationTest,
  type IntegrationTestContext,
} from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';

const FILES_DIR = path.join(process.cwd(), 'server', 'files');
const OUTPUTS_DIR = path.join(FILES_DIR, 'outputs');
const ARCHIVES_DIR = path.join(FILES_DIR, 'archives');

function createDocxBuffer(content: string): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${content}</w:t></w:r></w:p></w:body>
</w:document>`
  );
  return zip.generate({ type: 'nodebuffer' });
}

function readDocxText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  return (zip.file('word/document.xml')?.asText() ?? '').replace(/<[^>]+>/g, '');
}

describe.sequential('DEBT-15: final-block download survives losing the working directory', () => {
  let ctx: IntegrationTestContext;
  let factory: TestFactory;
  const templateFileRefs: string[] = [];

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'Storage Durability Tenant',
      createProject: true,
      projectName: 'Storage Durability Project',
      userRole: 'admin',
      tenantRole: 'owner',
    });
    factory = new TestFactory(db);
    await fs.mkdir(OUTPUTS_DIR, { recursive: true });
  });

  afterAll(async () => {
    for (const fileRef of templateFileRefs) {
      await fs.unlink(path.join(FILES_DIR, fileRef)).catch(() => { });
    }
    await ctx.cleanup();
  });

  it('serves the document over HTTP after the generation directories are deleted', async () => {
    const projectId = ctx.projectId!;
    const { workflow } = await factory.createWorkflow(projectId, ctx.userId);
    const section = await factory.createSection(workflow.id);
    const textStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Client name',
      alias: 'clientName',
      order: 0,
    });

    const fileRef = `debt15-durability-${Date.now()}.docx`;
    await fs.mkdir(FILES_DIR, { recursive: true });
    await fs.writeFile(path.join(FILES_DIR, fileRef), createDocxBuffer('Contract for {{clientName}}'));
    templateFileRefs.push(fileRef);
    const { template } = await factory.createTemplate(projectId, ctx.userId, {
      name: 'Durability Contract',
      fileRef,
    });

    await factory.createStep(section.id, {
      type: 'final',
      title: 'Final documents',
      order: 1,
      config: {
        markdownHeader: '',
        documents: [{ id: 'doc-1', documentId: template.id, alias: 'contract' }],
      },
    });

    const runToken = `debt15-token-${Date.now()}`;
    const [run] = await db
      .insert(schema.workflowRuns)
      .values({
        workflowId: workflow.id,
        runToken,
        createdBy: `creator:${ctx.userId}`,
      })
      .returning();
    await db.insert(schema.stepValues).values({
      runId: run.id,
      stepId: textStep.id,
      value: 'Acme Corporation',
    });

    const result = await runLifecycleService.generateDocuments(run.id);
    expect(result.success).toBe(true);

    const [record] = await db
      .select()
      .from(schema.runGeneratedDocuments)
      .where(eq(schema.runGeneratedDocuments.runId, run.id));
    expect(record).toBeDefined();
    expect(record.storageKey).toBeTruthy();

    // Simulate the deploy: destroy every directory the generator writes into.
    // The artifact must not be reachable through any of them any more.
    await fs.rm(OUTPUTS_DIR, { recursive: true, force: true });
    await fs.rm(ARCHIVES_DIR, { recursive: true, force: true });
    await expect(fs.access(path.join(ARCHIVES_DIR, record.fileName))).rejects.toThrow();
    await expect(fs.access(path.join(OUTPUTS_DIR, record.fileName))).rejects.toThrow();

    // The normal per-run download path still returns the real document. This
    // route mounts only `creatorOrRunTokenAuth` (no `hybridAuth` ahead of it),
    // so a run token is the credential it actually accepts.
    const response = await request(ctx.baseURL)
      .get(`/api/runs/${run.id}/final-documents/${record.fileName}/download`)
      .set('Authorization', `Bearer ${runToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(readDocxText(response.body as Buffer)).toContain('Contract for Acme Corporation');
  });
});
