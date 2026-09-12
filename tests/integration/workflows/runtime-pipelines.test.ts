/**
 * Integration Tests for Runtime Pipelines
 * Tests end-to-end execution of the document generation pipeline
 */
import fs from 'fs/promises';
import path from 'path';

import { sql, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import PizZip from 'pizzip';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  tenants,
  users,
  projects,
  workflows,
  pages,
  steps,
  workflowRuns,
  templates,
  runGeneratedDocuments,
} from '@shared/schema';
import type { FinalBlockConfig } from '@shared/types/stepConfigs';

import { stepValueRepository } from '../../../server/repositories';
import { runLifecycleService } from '../../../server/services/workflow-runs/RunLifecycleService';
import { storageProvider } from '../../../server/services/storage/index';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../../helpers/ownerDb";

// ---------------------------------------------------------------------------
// Real-docx fixture helpers, copied from tests/integration/docs.autogeneration.test.ts
// (DEBT-3a: the "preferred fix" is to reuse that file's approach rather than
// invent a new one; these are local, non-exported helpers there too).
// ---------------------------------------------------------------------------

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

/** Read the rendered body text of a generated DOCX */
async function readDocxText(buffer: Buffer): Promise<string> {
  const zip = new PizZip(buffer);
  const xml = zip.file('word/document.xml')?.asText() ?? '';
  return xml.replace(/<[^>]+>/g, '');
}

/**
 * Retrieve the generated file buffer from the storage provider.
 */
async function getGeneratedFileBuffer(storageKey: string): Promise<Buffer> {
  return storageProvider.getFile(storageKey);
}

const FILES_DIR = path.join(process.cwd(), 'server', 'files');
const OUTPUTS_DIR = path.join(FILES_DIR, 'outputs');
describe('Runtime Pipelines Integration Tests', () => {
  const testUserId = nanoid(); // Use random ID to prevent collisions
  let testTenantId: string;
  let testProjectId: string;
  let testWorkflowId: string;
  let testRunId: string;
  let emailStepId: string;
  let phoneStepId: string;
  beforeAll(async () => {
    // Create test tenant
    const [tenant] = await getOwnerDb()
      .insert(tenants)
      .values({
        name: 'Test Tenant - Runtime Pipelines',
      })
      .returning();
    testTenantId = tenant.id;
    // Create test user
    const [_user] = await getOwnerDb().insert(users).values({
      id: testUserId,
      email: 'test-pipeline-user@example.com',
      tenantId: testTenantId,
      role: 'admin',
      tenantRole: 'owner',
    } as any).returning(); // Cast to any to avoid partial type issues if necessary
    // Create test project
    const [project] = await getOwnerDb()
      .insert(projects)
      .values({
        title: 'Test Project',
        name: 'Test Project',
        tenantId: testTenantId,
        creatorId: testUserId,
        createdBy: testUserId,
        ownerId: testUserId,
      })
      .returning();
    testProjectId = project.id;
    // Create test workflow
    const [workflow] = await getOwnerDb()
      .insert(workflows)
      .values({
        projectId: testProjectId,
        title: 'Test Workflow - Runtime Pipelines',
        status: 'draft',
        creatorId: testUserId,
        ownerId: testUserId,
      })
      .returning();
    testWorkflowId = workflow.id;
    // Create test page
    const [page] = await getOwnerDb()
      .insert(pages)
      .values({
        workflowId: testWorkflowId,
        title: 'Contact Info',
        order: 1,
      })
      .returning();
    // Create test steps
    const [emailStep] = await getOwnerDb()
      .insert(steps)
      .values({
        workflowId: testWorkflowId,
        pageId: page.id,
        type: 'email',
        title: 'Email Address',
        alias: 'email',
        required: true,
        order: 1,
      })
      .returning();
    emailStepId = emailStep.id;
    const [phoneStep] = await getOwnerDb()
      .insert(steps)
      .values({
        workflowId: testWorkflowId,
        pageId: page.id,
        type: 'phone',
        title: 'Phone Number',
        alias: 'phone',
        required: false,
        order: 2,
      })
      .returning();
    phoneStepId = phoneStep.id;
    // Create workflow run
    const [run] = await getOwnerDb()
      .insert(workflowRuns)
      .values({
        workflowId: testWorkflowId,
        runToken: 'test-run-token-123',
        createdBy: testUserId,
        progress: 0,
        completed: false,
      })
      .returning();
    testRunId = run.id;
    // Save step values
    await stepValueRepository.create({
      runId: testRunId,
      stepId: emailStepId,
      value: 'test@example.com',
    });
    await stepValueRepository.create({
      runId: testRunId,
      stepId: phoneStepId,
      value: '+1-555-0123',
    });
  });
  afterAll(async () => {
    // Cleanup in reverse order of creation
    if (testRunId) {await getOwnerDb().delete(workflowRuns).where(eq(workflowRuns.id, testRunId));}
    if (testWorkflowId) {
      await getOwnerDb().delete(pages).where(eq(pages.workflowId, testWorkflowId));
      await getOwnerDb().delete(workflows).where(eq(workflows.id, testWorkflowId));
    }
    if (testProjectId) {await getOwnerDb().delete(projects).where(eq(projects.id, testProjectId));}
    // User and tenant cleanup
    await getOwnerDb().delete(users).where(eq(users.id, testUserId));
    if (testTenantId) {await getOwnerDb().delete(tenants).where(eq(tenants.id, testTenantId));}
  });
  describe('Document Generation Pipeline', () => {
    let testTemplateId: string;
    let testTemplateFileRef: string;
    let testFinalPageId: string;
    // Runs created by tests in this block, so cleanup can scope the shared
    // run_generated_documents table to rows this suite actually created
    // instead of a table-wide delete (see afterAll below).
    const docGenRunIds: string[] = [];

    beforeAll(async () => {
      // Real docx bytes on disk (server/files), not an orphaned fake fileRef.
      // The document merges the run's `email` step value directly, matching
      // the alias-keyed variables RunLifecycleService.generateDocuments hands
      // to the renderer -- same pattern as docs.autogeneration.test.ts.
      testTemplateFileRef = `test-runtime-pipelines-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.docx`;
      await fs.mkdir(FILES_DIR, { recursive: true });
      await fs.mkdir(OUTPUTS_DIR, { recursive: true });
      await fs.writeFile(
        path.join(FILES_DIR, testTemplateFileRef),
        createDocxBuffer('Document for {{email}}')
      );

      const [template] = await getOwnerDb()
        .insert(templates)
        .values({
          projectId: testProjectId,
          name: 'Test Template',
          fileRef: testTemplateFileRef,
          type: 'docx',
          helpersVersion: 1,
        })
        .returning();
      testTemplateId = template.id;

      // Wire the template into an actual 'final' step the run reaches, with
      // the visibleIf expression as that document's `conditions` -- the
      // shape RunLifecycleService/EnhancedDocumentEngine actually evaluate
      // (LU-5: ConditionExpression, the same nested AND/OR-group language
      // steps.visible_if / pages.visible_if use -- not the old flat
      // LogicExpression `{ operator, conditions: [{ key, op, value }] }`
      // this superseded). The old fixture put an equivalent-looking but
      // incompatible nested ConditionGroup on `template.metadata.visibleIf`
      // and never attached the template to any step at all, so it was
      // orphaned twice over.
      const [finalPage] = await getOwnerDb()
        .insert(pages)
        .values({
          workflowId: testWorkflowId,
          title: 'Final Documents',
          order: 2,
        })
        .returning();
      testFinalPageId = finalPage.id;

      const finalBlockConfig: FinalBlockConfig = {
        markdownHeader: '',
        documents: [
          {
            id: 'doc-1',
            documentId: testTemplateId,
            alias: 'contract',
            conditions: {
              type: 'group',
              id: 'g1',
              operator: 'AND',
              conditions: [
                { type: 'condition', id: 'c1', variable: 'email', operator: 'contains', value: 'show', valueType: 'constant' },
              ],
            },
          },
        ],
      };
      await getOwnerDb().insert(steps).values({
        workflowId: testWorkflowId,
        pageId: testFinalPageId,
        type: 'final_documents',
        title: 'Final documents',
        order: 3,
        config: finalBlockConfig,
      });
    });
    afterAll(async () => {
      // Scoped to the runs this suite created -- never a table-wide delete
      // (the shared test DB has other suites' rows in this table too).
      if (docGenRunIds.length > 0) {
        await getOwnerDb().delete(runGeneratedDocuments).where(inArray(runGeneratedDocuments.runId, docGenRunIds));
      }
      if (testFinalPageId) {
        await getOwnerDb().delete(steps).where(eq(steps.pageId, testFinalPageId));
        await getOwnerDb().delete(pages).where(eq(pages.id, testFinalPageId));
      }
      await getOwnerDb().delete(templates).where(sql`id = ${testTemplateId}`);
      if (testTemplateFileRef) {
        await fs.unlink(path.join(FILES_DIR, testTemplateFileRef)).catch(() => { });
      }
    });

    it('should skip document generation when visibleIf condition is false', async () => {
      // Create run with email that does NOT contain 'show'
      const [hiddenRun] = await getOwnerDb()
        .insert(workflowRuns)
        .values({
          workflowId: testWorkflowId,
          runToken: `test-doc-hidden-${Date.now()}`,
          createdBy: testUserId,
          progress: 100,
          completed: true,
        })
        .returning();
      docGenRunIds.push(hiddenRun.id);
      await stepValueRepository.create({
        runId: hiddenRun.id,
        stepId: emailStepId,
        value: 'hidden@example.com', // Does NOT contain 'show'
      });

      const result = await runLifecycleService.generateDocuments(hiddenRun.id);

      expect(result.success).toBe(true);
      expect(result.documentsGenerated).toBe(0);

      const records = await getOwnerDb()
        .select()
        .from(runGeneratedDocuments)
        .where(eq(runGeneratedDocuments.runId, hiddenRun.id));
      expect(records).toHaveLength(0);

      // Cleanup (cascades run_generated_documents, none expected anyway)
      await getOwnerDb().delete(workflowRuns).where(sql`id = ${hiddenRun.id}`);
    });

    it('should generate document when visibleIf condition is true', async () => {
      // Create run with email that DOES contain 'show'
      const [visibleRun] = await getOwnerDb()
        .insert(workflowRuns)
        .values({
          workflowId: testWorkflowId,
          runToken: `test-doc-visible-${Date.now()}`,
          createdBy: testUserId,
          progress: 100,
          completed: true,
        })
        .returning();
      docGenRunIds.push(visibleRun.id);
      await stepValueRepository.create({
        runId: visibleRun.id,
        stepId: emailStepId,
        value: 'show@example.com', // DOES contain 'show'
      });
      await stepValueRepository.create({
        runId: visibleRun.id,
        stepId: phoneStepId,
        value: '+1-555-7777',
      });

      const result = await runLifecycleService.generateDocuments(visibleRun.id);

      expect(result.success).toBe(true);
      expect(result.documentsGenerated).toBe(1);

      const records = await getOwnerDb().select().from(runGeneratedDocuments).where(eq(runGeneratedDocuments.runId, visibleRun.id));
      expect(records).toHaveLength(1);

      const buffer = await getGeneratedFileBuffer(records[0].storageKey);
      const text = await readDocxText(buffer);
      expect(text).toContain('Document for show@example.com');

      // Cleanup
      await getOwnerDb().delete(workflowRuns).where(sql`id = ${visibleRun.id}`);
    });
  });
});
