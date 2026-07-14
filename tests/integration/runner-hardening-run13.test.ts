import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

import { eq } from 'drizzle-orm';
import PizZip from 'pizzip';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import { RunLifecycleService } from '../../server/services/workflow-runs/RunLifecycleService';
import { runService } from '../../server/services/RunService';
import { TestFactory } from '../helpers/testFactory';
import { setupIntegrationTest, type IntegrationTestContext } from '../helpers/integrationTestHelper';

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
  <w:body>
    <w:p><w:r><w:t>${content}</w:t></w:r></w:p>
  </w:body>
</w:document>`
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const FILES_DIR = path.join(process.cwd(), 'server', 'files');

describe.sequential('RUN-13 runner hardening close-out coverage', () => {
  let ctx: IntegrationTestContext;
  let factory: TestFactory;
  const templateFileRefs: string[] = [];

  beforeAll(async () => {
    ctx = await setupIntegrationTest({
      tenantName: 'RUN-13 Tenant',
      createProject: true,
    });
    factory = new TestFactory(db);
    await fs.mkdir(FILES_DIR, { recursive: true });
  });

  afterAll(async () => {
    for (const fileRef of templateFileRefs) {
      await fs.unlink(path.join(FILES_DIR, fileRef)).catch(() => { });
    }
    await ctx.cleanup();
  });

  async function createTemplateOnDisk(projectId: string, name: string, body: string): Promise<string> {
    const fileRef = `run13-${randomUUID()}.docx`;
    await fs.writeFile(path.join(FILES_DIR, fileRef), createDocxBuffer(body));
    templateFileRefs.push(fileRef);

    const { template } = await factory.createTemplate(projectId, ctx.userId, {
      name,
      fileRef,
    });
    return template.id;
  }

  async function createRun(workflowId: string, workflowVersionId?: string): Promise<{ runId: string; runToken: string }> {
    const runToken = `run13-token-${randomUUID()}`;
    const [run] = await db.insert(schema.workflowRuns).values({
      workflowId,
      workflowVersionId,
      runToken,
      createdBy: `creator:${ctx.userId}`,
      completed: false,
    }).returning();

    return { runId: run.id, runToken };
  }

  async function createOtherProjectTemplate(): Promise<string> {
    const [otherProject] = await db.insert(schema.projects).values({
      title: 'RUN-13 Other Project',
      name: 'RUN-13 Other Project',
      tenantId: ctx.tenantId,
      createdBy: ctx.userId,
      creatorId: ctx.userId,
      ownerId: ctx.userId,
    }).returning();

    const { template } = await factory.createTemplate(otherProject.id, ctx.userId, {
      name: 'Out-of-project legacy template',
      fileRef: `unused-cross-project-${randomUUID()}.docx`,
    });
    return template.id;
  }

  async function createLegacyWorkflowWithTemplate(templateId: string): Promise<{ workflowId: string; runId: string; runToken: string }> {
    const { workflow, version } = await factory.createWorkflow(ctx.projectId!, ctx.userId);
    const section = await factory.createSection(workflow.id, {
      config: { finalBlock: true, templates: [templateId] },
    });
    await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Client name',
      alias: 'clientName',
      required: false,
      order: 0,
    });
    const run = await createRun(workflow.id, version.id);
    return { workflowId: workflow.id, ...run };
  }

  async function getGeneratedDocuments(runId: string): Promise<Array<typeof schema.runGeneratedDocuments.$inferSelect>> {
    return db
      .select()
      .from(schema.runGeneratedDocuments)
      .where(eq(schema.runGeneratedDocuments.runId, runId));
  }

  async function waitForGenerationStatus(runId: string, expectedPrefix: string): Promise<string> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const [run] = await db
        .select({ generationStatus: schema.workflowRuns.generationStatus })
        .from(schema.workflowRuns)
        .where(eq(schema.workflowRuns.id, runId));

      const status = run?.generationStatus ?? '';
      if (status.startsWith(expectedPrefix)) {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`Timed out waiting for generationStatus prefix ${expectedPrefix}`);
  }

  it('RUN-10: concurrent document generation persists exactly one document set', async () => {
    const { workflow, version } = await factory.createWorkflow(ctx.projectId!, ctx.userId);
    const section = await factory.createSection(workflow.id);
    const textStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Client name',
      alias: 'clientName',
      order: 0,
    });
    const templateId = await createTemplateOnDisk(ctx.projectId!, 'Concurrent Contract', 'Contract for {{clientName}}');
    await factory.createStep(section.id, {
      type: 'final',
      title: 'Final documents',
      order: 1,
      config: {
        markdownHeader: '',
        documents: [
          { id: 'doc-1', documentId: templateId, alias: 'contract' },
        ],
      },
    });
    const { runId } = await createRun(workflow.id, version.id);
    await db.insert(schema.stepValues).values({
      runId,
      stepId: textStep.id,
      value: 'Ada Lovelace LLC',
    });

    const [first, second] = await Promise.all([
      new RunLifecycleService().generateDocuments(runId),
      new RunLifecycleService().generateDocuments(runId),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect([first.documentsGenerated, second.documentsGenerated].sort()).toEqual([0, 1]);
    await expect(getGeneratedDocuments(runId)).resolves.toHaveLength(1);
  });

  it('RUN-12: creator completion fails legacy cross-project templates as not found without rendering', async () => {
    const templateId = await createOtherProjectTemplate();
    const { runId } = await createLegacyWorkflowWithTemplate(templateId);

    await runService.completeRun(runId, ctx.userId);

    const status = await waitForGenerationStatus(runId, 'failed:');
    expect(status).toContain('Template with id');
    await expect(getGeneratedDocuments(runId)).resolves.toHaveLength(0);
  });

  it('RUN-12: no-auth/run-token completion fails legacy cross-project templates as not found without rendering', async () => {
    const templateId = await createOtherProjectTemplate();
    const { runId, runToken } = await createLegacyWorkflowWithTemplate(templateId);

    const response = await request(ctx.baseURL)
      .put(`/api/runs/${runId}/complete`)
      .set('Authorization', `Bearer ${runToken}`);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.success).toBe(true);
    const status = await waitForGenerationStatus(runId, 'failed:');
    expect(status).toContain('Template with id');
    await expect(getGeneratedDocuments(runId)).resolves.toHaveLength(0);
  });
});
