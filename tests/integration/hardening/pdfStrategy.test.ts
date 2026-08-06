/**
 * DOCH-5 AC 3, end to end: a real Gotenberg conversion must be recorded as
 * `gotenberg` on the generated-document row.
 *
 * The other DOCH-5 tests stub both strategies, and the converter smoke test
 * exercises PdfConverter directly. Neither proves the property that actually
 * matters in production: that a document generated through the *whole* stack —
 * RunLifecycleService -> FinalBlockRenderer -> EnhancedDocumentEngine ->
 * DocumentEngine -> PdfConverter -> Gotenberg -> run_generated_documents —
 * lands in the database labelled with the converter that really produced it.
 *
 * This is the regression net for the incident: production had a Gotenberg URL
 * configured against a stub that always threw, every PDF was silently produced
 * by the low-fidelity fallback, and the row said `puppeteer` either way, so the
 * degradation was invisible.
 *
 * Requires a reachable Gotenberg (docker run --rm -p 3009:3000 gotenberg/gotenberg:8).
 * Skips itself when there isn't one, so CI without the service stays green
 * rather than failing on an absent dependency.
 */
import fs from 'fs/promises';
import path from 'path';

import { eq } from 'drizzle-orm';
import PizZip from 'pizzip';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../../server/db';
import { storageProvider } from '../../../server/services/storage';
import { runLifecycleService } from '../../../server/services/workflow-runs/RunLifecycleService';
import { TestFactory } from '../../helpers/testFactory';

/**
 * PdfConverter reads PDF_CONVERTER_API_URL in its constructor and DocumentEngine
 * is a module-level singleton, so the variable has to be set before the import
 * graph is evaluated. vi.hoisted is lifted above the imports below, which is
 * exactly the window needed — beforeAll would run far too late. (The same
 * construction-time binding is why changing this variable in production needs a
 * restart, not just a config save.)
 */
const { converterUrl } = vi.hoisted(() => {
  const url = process.env.PDF_CONVERTER_API_URL ?? 'http://localhost:3009';
  process.env.PDF_CONVERTER_API_URL = url;
  // The test artifact must stay local even when the developer's .env selects
  // the real S3 provider. The provider singleton is built during imports, so
  // this belongs in the same pre-import hoist as the converter URL.
  process.env.STORAGE_DRIVER = 'disk';
  return { converterUrl: url };
});

const FILES_DIR = path.join(process.cwd(), 'server', 'files');

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
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Is a real Gotenberg listening? Never fail the suite over its absence. */
async function gotenbergReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${converterUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

describe('Hardening: generated documents record the real converter', () => {
  const factory = new TestFactory(db);
  let tenantId: string;
  let userId: string;
  let projectId: string;
  let converterUp = false;
  const templateFileRefs: string[] = [];
  const generatedStorageKeys: string[] = [];

  beforeAll(async () => {
    converterUp = await gotenbergReachable();
    const setup = await factory.createTenant();
    tenantId = setup.tenant.id;
    userId = setup.user.id;
    projectId = setup.project.id;
    await fs.mkdir(FILES_DIR, { recursive: true });
  });

  afterAll(async () => {
    try {
      if (projectId) {
        await db.delete(schema.workflows).where(eq(schema.workflows.projectId, projectId));
      }
      if (tenantId) {
        await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
      }
      for (const fileRef of templateFileRefs) {
        await fs.unlink(path.join(FILES_DIR, fileRef)).catch(() => { });
      }
      for (const storageKey of generatedStorageKeys) {
        await storageProvider.deleteFile(storageKey);
      }
    } catch (error) {
      console.error('Cleanup error (non-fatal):', error);
    }
  });

  it('records pdf_strategy=gotenberg for a PDF produced by a real Gotenberg', async (ctx) => {
    if (!converterUp) {
      ctx.skip(`No Gotenberg at ${converterUrl}`);
      return;
    }

    const { workflow } = await factory.createWorkflow(projectId, userId);
    const section = await factory.createSection(workflow.id);
    const textStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Client name',
      alias: 'clientName',
      order: 0,
    });

    const fileRef = `test-pdfstrategy-${Date.now()}.docx`;
    await fs.mkdir(FILES_DIR, { recursive: true });
    await fs.writeFile(
      path.join(FILES_DIR, fileRef),
      createDocxBuffer('Engagement letter for {{clientName}}')
    );
    templateFileRefs.push(fileRef);
    const { template } = await factory.createTemplate(projectId, userId, {
      name: 'Engagement Letter',
      fileRef,
    });

    await factory.createStep(section.id, {
      type: 'final',
      title: 'Final documents',
      order: 1,
      config: {
        markdownHeader: '',
        documents: [{ id: 'doc-1', documentId: template.id, alias: 'engagement' }],
      },
    });

    const [run] = await db
      .insert(schema.workflowRuns)
      .values({
        workflowId: workflow.id,
        runToken: `test-token-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        createdBy: `creator:${userId}`,
      })
      .returning();
    await db.insert(schema.stepValues).values({
      runId: run.id,
      stepId: textStep.id,
      value: 'Acme Corporation',
    });

    const result = await runLifecycleService.generateDocuments(run.id, { toPdf: true });

    expect(result.success).toBe(true);
    expect(result.documentsGenerated).toBe(1);

    const records = await db
      .select()
      .from(schema.runGeneratedDocuments)
      .where(eq(schema.runGeneratedDocuments.runId, run.id));
    expect(records).toHaveLength(1);

    // The whole point: the row names the converter that actually ran. A
    // 'puppeteer' value here with a converter configured means the
    // high-fidelity path failed and the fallback silently produced the file.
    expect(records[0].pdfStrategy).toBe('gotenberg');

    // ...and a real PDF exists in durable storage, so the label is not
    // describing a phantom. The renderer deliberately deletes its local
    // scratch output after upload, so read through the provider contract.
    generatedStorageKeys.push(records[0].storageKey);
    const bytes = await storageProvider.getFile(records[0].storageKey);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  }, 120_000);
});
