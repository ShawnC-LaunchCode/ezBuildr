import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import PizZip from 'pizzip';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { storageProvider } from '../../server/services/storage';
import { runCompletionJobWorker } from '../../server/services/workflow-runs/RunCompletionJobWorker';
import { runService } from '../../server/services/RunService';
import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';
import { TestFactory } from '../helpers/testFactory';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

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

function readDocxText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  return (zip.file('word/document.xml')?.asText() ?? '').replace(/<[^>]+>/g, '');
}

describe.sequential('GH-171 Follow-up: Template Version Pinning Security', () => {
  let ctx1: IntegrationTestContext;
  let ctx2: IntegrationTestContext;
  let factory: TestFactory;
  const inputFileRefs: string[] = [];
  const generatedStorageKeys = new Set<string>();

  beforeAll(async () => {
    ctx1 = await setupIntegrationTest({
      tenantName: 'Tenant A',
      createProject: true,
      projectName: 'Project A',
      userRole: 'admin',
      tenantRole: 'owner',
    });
    ctx2 = await setupIntegrationTest({
      tenantName: 'Tenant B',
      createProject: true,
      projectName: 'Project B',
      userRole: 'admin',
      tenantRole: 'owner',
    });
    factory = new TestFactory();
    await fs.mkdir(FILES_DIR, { recursive: true });
  });

  beforeEach(async () => {
    // The real completion worker claims a global queue within this test schema.
    // Keep each case responsible only for the job it just enqueued.
    await getOwnerDb().delete(schema.runCompletionJobs);
  });

  afterAll(async () => {
    for (const storageKey of generatedStorageKeys) {
      await storageProvider.deleteFile(storageKey);
    }
    for (const fileRef of inputFileRefs) {
      await fs.unlink(path.join(FILES_DIR, fileRef)).catch(() => undefined);
    }
    await ctx1.cleanup();
    await ctx2.cleanup();
  });

  async function createTemplateFile(prefix: string, content: string): Promise<string> {
    const fileRef = `g171-2-${prefix}-${randomUUID()}.docx`;
    await fs.writeFile(path.join(FILES_DIR, fileRef), createDocxBuffer(content));
    inputFileRefs.push(fileRef);
    return fileRef;
  }

  async function createTemplateVersion(
    ctx: IntegrationTestContext,
    prefix: string,
    content: string
  ): Promise<{
    template: typeof schema.templates.$inferSelect;
    version: typeof schema.templateVersions.$inferSelect;
  }> {
    const currentFileRef = await createTemplateFile(`${prefix}-current`, `CURRENT ${content}`);
    const versionFileRef = await createTemplateFile(`${prefix}-version`, content);
    const { template } = await factory.createTemplate(ctx.projectId!, ctx.userId, {
      name: `${prefix} template`,
      fileRef: currentFileRef,
    });
    const [version] = await getOwnerDb().insert(schema.templateVersions).values({
      id: randomUUID(),
      templateId: template.id,
      versionNumber: 1,
      fileRef: versionFileRef,
      metadata: {},
      mapping: {},
      createdBy: ctx.userId,
    }).returning();
    return { template, version };
  }

  function rememberPreviewFiles(response: Response): void {
    const documents = response.body?.data?.documents as Array<{ storageKey?: unknown }> | undefined;
    for (const document of documents ?? []) {
      if (typeof document.storageKey === 'string') {
        generatedStorageKeys.add(document.storageKey);
      }
    }
  }

  async function previewPinnedVersion(
    workflowId: string,
    stepId: string,
    templateId: string,
    pinnedVersionId: string,
    alias: string
  ): Promise<Response> {
    const response = await request(ctx1.app)
      .post(`/api/workflows/${workflowId}/preview/generate-final`)
      .set('Authorization', `Bearer ${ctx1.authToken}`)
      .send({
        stepId,
        finalBlockConfig: {
          markdownHeader: '',
          documents: [{
            id: randomUUID(),
            documentId: templateId,
            alias,
            pinnedVersionId,
            mapping: {},
          }],
        },
        stepValues: {},
        toPdf: false,
      });
    rememberPreviewFiles(response);
    return response;
  }

  async function createRunWithPin(
    templateId: string,
    pinnedVersionId: string,
    alias: string
  ): Promise<{ runId: string; workflowId: string; finalStepId: string }> {
    const { workflow } = await factory.createWorkflow(ctx1.projectId!, ctx1.userId);
    const section = await factory.createSection(workflow.id);
    const finalStep = await factory.createStep(section.id, {
      type: 'final',
      title: 'Final documents',
      config: {
        markdownHeader: '',
        documents: [{
          id: randomUUID(),
          documentId: templateId,
          alias,
          pinnedVersionId,
          mapping: {},
        }],
      },
    });
    const [run] = await getOwnerDb().insert(schema.workflowRuns).values({
      workflowId: workflow.id,
      runToken: `g171-2-${randomUUID()}`,
      createdBy: `creator:${ctx1.userId}`,
    }).returning();
    return { runId: run.id, workflowId: workflow.id, finalStepId: finalStep.id };
  }

  async function completeRunAndProcess(runId: string): Promise<{
    generationStatus: string | null;
    documents: Array<typeof schema.runGeneratedDocuments.$inferSelect>;
  }> {
    const completedRun = await runService.completeRun(runId, ctx1.userId);
    expect(completedRun.completed).toBe(true);

    const processed = await runCompletionJobWorker.processBatch(`g171-2-${runId}`, 1);
    expect(processed).toBe(1);

    const [run] = await getOwnerDb()
      .select({ generationStatus: schema.workflowRuns.generationStatus })
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, runId));
    const documents = await getOwnerDb()
      .select()
      .from(schema.runGeneratedDocuments)
      .where(eq(schema.runGeneratedDocuments.runId, runId));
    for (const document of documents) {
      generatedStorageKeys.add(document.storageKey);
    }
    return { generationStatus: run.generationStatus, documents };
  }

  it('rejects a pinned version belonging to a different tenant/project in preview', async () => {
    const { version: versionB } = await createTemplateVersion(ctx2, 'preview-foreign', 'FOREIGN PREVIEW');
    const { workflow: workflowA } = await factory.createWorkflow(ctx1.projectId!, ctx1.userId);
    const sectionA = await factory.createSection(workflowA.id);
    const { template: templateA } = await factory.createTemplate(ctx1.projectId!, ctx1.userId, {
      fileRef: await createTemplateFile('preview-foreign-target', 'AUTHORIZED TARGET'),
    });

    const response = await previewPinnedVersion(
      workflowA.id,
      sectionA.id,
      templateA.id,
      versionB.id,
      'doc_a'
    );

    expect(response.status).toBe(404);
  });

  it('rejects a pinned version belonging to a different template in the same project in preview', async () => {
    const { version: versionA1 } = await createTemplateVersion(ctx1, 'preview-wrong-template', 'WRONG PREVIEW');
    const { workflow: workflowA } = await factory.createWorkflow(ctx1.projectId!, ctx1.userId);
    const sectionA = await factory.createSection(workflowA.id);
    const { template: templateA2 } = await factory.createTemplate(ctx1.projectId!, ctx1.userId, {
      fileRef: await createTemplateFile('preview-wrong-target', 'AUTHORIZED TARGET'),
    });

    const response = await previewPinnedVersion(
      workflowA.id,
      sectionA.id,
      templateA2.id,
      versionA1.id,
      'doc_a2'
    );

    expect(response.status).toBe(404);
  });

  it('real run completion rejects a pinned version belonging to a different tenant/project without rendering it', async () => {
    const { version: versionB } = await createTemplateVersion(ctx2, 'run-foreign', 'FOREIGN RUN CONTENT');
    const { template: templateA } = await factory.createTemplate(ctx1.projectId!, ctx1.userId, {
      fileRef: await createTemplateFile('run-foreign-target', 'AUTHORIZED TARGET'),
    });
    const { runId } = await createRunWithPin(templateA.id, versionB.id, 'foreign_run_doc');

    const result = await completeRunAndProcess(runId);

    expect(result.generationStatus).toMatch(/^failed:/);
    expect(result.documents).toHaveLength(0);
  });

  it('real run completion rejects a same-project pin from the wrong template without rendering it', async () => {
    const { version: wrongVersion } = await createTemplateVersion(ctx1, 'run-wrong-template', 'WRONG TEMPLATE CONTENT');
    const { template: targetTemplate } = await factory.createTemplate(ctx1.projectId!, ctx1.userId, {
      fileRef: await createTemplateFile('run-wrong-target', 'AUTHORIZED TARGET'),
    });
    const { runId } = await createRunWithPin(targetTemplate.id, wrongVersion.id, 'wrong_template_doc');

    const result = await completeRunAndProcess(runId);

    expect(result.generationStatus).toMatch(/^failed:/);
    expect(result.documents).toHaveLength(0);
  });

  it('preview and real-run completion render the same valid pinned template version row', async () => {
    const marker = `PINNED ROW ${randomUUID()}`;
    const { template, version } = await createTemplateVersion(ctx1, 'parity', marker);
    const { runId, workflowId, finalStepId } = await createRunWithPin(
      template.id,
      version.id,
      'parity_doc'
    );

    const preview = await previewPinnedVersion(
      workflowId,
      finalStepId,
      template.id,
      version.id,
      'parity_doc'
    );
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    const previewStorageKey = preview.body.data.documents[0].storageKey as string;
    const previewText = readDocxText(await storageProvider.getFile(previewStorageKey));

    const runResult = await completeRunAndProcess(runId);
    expect(runResult.generationStatus).toBe('done');
    expect(runResult.documents).toHaveLength(1);
    const runText = readDocxText(await storageProvider.getFile(runResult.documents[0].storageKey));
    const versionText = readDocxText(await storageProvider.getFile(version.fileRef));

    expect(versionText).toContain(marker);
    expect(previewText).toBe(versionText);
    expect(runText).toBe(versionText);
    expect(previewText).not.toContain(`CURRENT ${marker}`);
  });
});
