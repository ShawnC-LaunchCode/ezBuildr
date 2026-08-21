/**
 * Automatic document generation on run completion.
 *
 * Regression coverage for the consolidation breakage where
 * RunLifecycleService.generateDocuments filtered for a step type
 * ('final_block') that does not exist, so automatic generation never fired,
 * legacy Final Documents sections lost support, and no
 * run_generated_documents records were written.
 *
 * Exercises the real service against the real database and filesystem for
 * BOTH config shapes the product writes:
 *  - Final Block steps (step type 'final', config as FinalBlockConfig)
 *  - Legacy sections (section.config.finalBlock + config.templates)
 */
import fs from 'fs/promises';
import path from 'path';

import { eq } from 'drizzle-orm';
import PizZip from 'pizzip';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import * as schema from '@shared/schema';

import { db } from '../../server/db';
import { runLifecycleService } from '../../server/services/workflow-runs/RunLifecycleService';
import { versionService } from '../../server/services/VersionService';
import { storageProvider } from '../../server/services/storage/index';
import { TestFactory } from '../helpers/testFactory';
// RLS-5: fixture setup and verification reads are the OBSERVER, not the
// application under test - see tests/helpers/ownerDb.ts.
import { getOwnerDb } from "../helpers/ownerDb";

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

const FILES_DIR = path.join(process.cwd(), 'server', 'files');
const OUTPUTS_DIR = path.join(FILES_DIR, 'outputs');

/**
 * Retrieve the generated file buffer from the storage provider.
 */
async function getGeneratedFileBuffer(storageKey: string): Promise<Buffer> {
  return storageProvider.getFile(storageKey);
}

describe('Automatic document generation on run completion', () => {
  const factory = new TestFactory(db);
  let tenantId: string;
  let userId: string;
  let projectId: string;
  const templateFileRefs: string[] = [];

  async function createTemplateOnDisk(
    name: string,
    body: string
  ): Promise<{ id: string; fileRef: string }> {
    const fileRef = `test-autogen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.docx`;
    await fs.mkdir(FILES_DIR, { recursive: true });
    await fs.writeFile(path.join(FILES_DIR, fileRef), createDocxBuffer(body));
    templateFileRefs.push(fileRef);

    const { template } = await factory.createTemplate(projectId, userId, {
      name,
      fileRef,
    });
    return { id: template.id, fileRef };
  }

  async function createRunWithValue(
    workflowId: string,
    stepId: string,
    value: unknown
  ): Promise<string> {
    const [run] = await db
      .insert(schema.workflowRuns)
      .values({
        workflowId,
        runToken: `test-token-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        createdBy: `creator:${userId}`,
      })
      .returning();

    await getOwnerDb().insert(schema.stepValues).values({
      runId: run.id,
      stepId,
      value,
    });

    return run.id;
  }

  beforeAll(async () => {
    const setup = await factory.createTenant();
    tenantId = setup.tenant.id;
    userId = setup.user.id;
    projectId = setup.project.id;
    await fs.mkdir(OUTPUTS_DIR, { recursive: true });
  });

  afterAll(async () => {
    try {
      if (projectId) {
        // Delete workflows first: workflow_versions.created_by references
        // users without cascade, so deleting the tenant directly violates FKs
        await getOwnerDb().delete(schema.workflows).where(eq(schema.workflows.projectId, projectId));
      }
      if (tenantId) {
        await getOwnerDb().delete(schema.tenants).where(eq(schema.tenants.id, tenantId));
      }
      for (const fileRef of templateFileRefs) {
        await fs.unlink(path.join(FILES_DIR, fileRef)).catch(() => { });
      }
    } catch (error) {
      console.error('Cleanup error (non-fatal):', error);
    }
  });

  it('generates and persists documents for a Final Block step (type "final")', async () => {
    const { workflow } = await factory.createWorkflow(projectId, userId);
    const section = await factory.createSection(workflow.id);
    const textStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Client name',
      alias: 'clientName',
      order: 0,
    });
    const template = await createTemplateOnDisk(
      'Final Block Contract',
      'Contract for {{clientName}}'
    );
    await factory.createStep(section.id, {
      type: 'final',
      title: 'Final documents',
      order: 1,
      config: {
        markdownHeader: '',
        documents: [
          { id: 'doc-1', documentId: template.id, alias: 'contract' },
        ],
      },
    });

    const runId = await createRunWithValue(workflow.id, textStep.id, 'Acme Corporation');

    const result = await runLifecycleService.generateDocuments(runId);

    expect(result.success).toBe(true);
    expect(result.documentsGenerated).toBe(1);

    // Record persisted with a working download URL
    const records = await db
      .select()
      .from(schema.runGeneratedDocuments)
      .where(eq(schema.runGeneratedDocuments.runId, runId));
    expect(records).toHaveLength(1);
    expect(records[0].fileUrl).toBe(
      `/api/runs/${runId}/final-documents/${records[0].fileName}/download`
    );

    // The generated file exists and contains the merged value
    const buffer = await getGeneratedFileBuffer(records[0].storageKey);
    const text = await readDocxText(buffer);
    expect(text).toContain('Contract for Acme Corporation');
  });

  it('RVP-4 AC2: generates documents from the run\'s pinned version, not a live final-block edit made after the run started', async () => {
    const { workflow } = await factory.createWorkflow(projectId, userId);
    const section = await factory.createSection(workflow.id);
    const textStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Client name',
      alias: 'clientName',
      order: 0,
    });
    const templateA = await createTemplateOnDisk('Pinned Contract', 'Contract A for {{clientName}}');
    const templateB = await createTemplateOnDisk('Edited Contract', 'Contract B for {{clientName}}');
    const finalStep = await factory.createStep(section.id, {
      type: 'final',
      title: 'Final documents',
      order: 1,
      config: {
        markdownHeader: '',
        documents: [
          { id: 'doc-1', documentId: templateA.id, alias: 'contract' },
        ],
      },
    });

    // Publish a version -- this is what the respondent's run gets pinned to,
    // and what generateDocuments must resolve final-block configs from.
    const version = await versionService.publishVersion(workflow.id, userId, 'initial publish');

    // Author edits the LIVE final block AFTER publish, repointing doc-1 at a
    // different template. If generateDocuments read the live tables, the
    // respondent's document would silently switch to template B's content --
    // a correctness/auditability bug, not just a UX one.
    await getOwnerDb().update(schema.steps).set({
      config: {
        markdownHeader: '',
        documents: [
          { id: 'doc-1', documentId: templateB.id, alias: 'contract' },
        ],
      },
    }).where(eq(schema.steps.id, finalStep.id));

    // Run is pinned to the version published BEFORE the live edit.
    const [run] = await db
      .insert(schema.workflowRuns)
      .values({
        workflowId: workflow.id,
        workflowVersionId: version.id,
        runToken: `test-token-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        createdBy: `creator:${userId}`,
      })
      .returning();
    await getOwnerDb().insert(schema.stepValues).values({
      runId: run.id,
      stepId: textStep.id,
      value: 'Acme Corporation',
    });

    const result = await runLifecycleService.generateDocuments(run.id);

    expect(result.success).toBe(true);
    expect(result.documentsGenerated).toBe(1);

    const records = await db
      .select()
      .from(schema.runGeneratedDocuments)
      .where(eq(schema.runGeneratedDocuments.runId, run.id));
    expect(records).toHaveLength(1);

    const text = await readDocxText(await getGeneratedFileBuffer(records[0].storageKey));
    expect(text).toContain('Contract A for Acme Corporation');
    expect(text).not.toContain('Contract B');
  });

  it('generates and persists documents for a legacy Final Documents section', async () => {
    const { workflow } = await factory.createWorkflow(projectId, userId);
    const template = await createTemplateOnDisk(
      'Legacy Section Letter',
      'Dear {{clientName}}, welcome aboard.'
    );
    // Legacy shape: section.config.finalBlock === true with template IDs;
    // WorkflowService still writes this shape for existing workflows
    const section = await factory.createSection(workflow.id, {
      config: { finalBlock: true, templates: [template.id] },
    });
    const textStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Client name',
      alias: 'clientName',
      order: 0,
    });

    const runId = await createRunWithValue(workflow.id, textStep.id, 'Globex LLC');

    const result = await runLifecycleService.generateDocuments(runId);

    expect(result.success).toBe(true);
    expect(result.documentsGenerated).toBe(1);

    const records = await db
      .select()
      .from(schema.runGeneratedDocuments)
      .where(eq(schema.runGeneratedDocuments.runId, runId));
    expect(records).toHaveLength(1);

    const text = await readDocxText(await getGeneratedFileBuffer(records[0].storageKey));
    expect(text).toContain('Dear Globex LLC, welcome aboard.');
  });

  it('LU-5: generates a document whose condition is met and skips one whose condition is not, via the real evaluator', async () => {
    const { workflow } = await factory.createWorkflow(projectId, userId);
    const section = await factory.createSection(workflow.id);
    const statusStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Status',
      alias: 'status',
      order: 0,
    });
    const approvedTemplate = await createTemplateOnDisk('Approval Letter', 'Congratulations, you are approved.');
    const rejectionTemplate = await createTemplateOnDisk('Rejection Letter', 'We are sorry, you were not approved.');
    await factory.createStep(section.id, {
      type: 'final',
      title: 'Final documents',
      order: 1,
      config: {
        markdownHeader: '',
        documents: [
          {
            id: 'doc-approved',
            documentId: approvedTemplate.id,
            alias: 'approvalLetter',
            conditions: {
              type: 'group',
              id: 'g1',
              operator: 'AND',
              conditions: [
                { type: 'condition', id: 'c1', variable: 'status', operator: 'equals', value: 'approved', valueType: 'constant' },
              ],
            },
          },
          {
            id: 'doc-rejected',
            documentId: rejectionTemplate.id,
            alias: 'rejectionLetter',
            conditions: {
              type: 'group',
              id: 'g2',
              operator: 'AND',
              conditions: [
                { type: 'condition', id: 'c2', variable: 'status', operator: 'equals', value: 'rejected', valueType: 'constant' },
              ],
            },
          },
        ],
      },
    });

    const runId = await createRunWithValue(workflow.id, statusStep.id, 'approved');

    const result = await runLifecycleService.generateDocuments(runId);

    expect(result.success).toBe(true);
    expect(result.documentsGenerated).toBe(1);
    // The condition-false document is reported as skipped, not as a failure.
    expect(result.skipped).toEqual(['rejectionLetter']);
    expect(result.failed ?? []).toHaveLength(0);

    const records = await db
      .select()
      .from(schema.runGeneratedDocuments)
      .where(eq(schema.runGeneratedDocuments.runId, runId));
    expect(records).toHaveLength(1);

    const text = await readDocxText(await getGeneratedFileBuffer(records[0].storageKey));
    expect(text).toContain('Congratulations, you are approved.');
  });

  it('LU-5: a legacy Final Documents section entry can carry a per-document condition via the widened { templateId, conditions } form', async () => {
    const { workflow } = await factory.createWorkflow(projectId, userId);
    const matchingTemplate = await createTemplateOnDisk('VIP Letter', 'Dear {{clientName}}, welcome to VIP status.');
    const nonMatchingTemplate = await createTemplateOnDisk('Standard Letter', 'Dear {{clientName}}, welcome aboard.');
    // Widened per-entry object form (LU-5): a bare-string sibling entry
    // proves the two forms coexist in one `templates` array, exercising the
    // same tolerant read AC3 covers for the all-bare-string case above.
    const section = await factory.createSection(workflow.id, {
      config: {
        finalBlock: true,
        templates: [
          {
            templateId: matchingTemplate.id,
            conditions: {
              type: 'group',
              id: 'g1',
              operator: 'AND',
              conditions: [
                { type: 'condition', id: 'c1', variable: 'tier', operator: 'equals', value: 'vip', valueType: 'constant' },
              ],
            },
          },
          {
            templateId: nonMatchingTemplate.id,
            conditions: {
              type: 'group',
              id: 'g2',
              operator: 'AND',
              conditions: [
                { type: 'condition', id: 'c2', variable: 'tier', operator: 'equals', value: 'standard', valueType: 'constant' },
              ],
            },
          },
        ],
      },
    });
    const nameStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Client name',
      alias: 'clientName',
      order: 0,
    });
    const tierStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Tier',
      alias: 'tier',
      order: 1,
    });

    const [run] = await db
      .insert(schema.workflowRuns)
      .values({
        workflowId: workflow.id,
        runToken: `test-token-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        createdBy: `creator:${userId}`,
      })
      .returning();
    await getOwnerDb().insert(schema.stepValues).values([
      { runId: run.id, stepId: nameStep.id, value: 'Wile E. Coyote' },
      { runId: run.id, stepId: tierStep.id, value: 'vip' },
    ]);

    const result = await runLifecycleService.generateDocuments(run.id);

    expect(result.success).toBe(true);
    expect(result.documentsGenerated).toBe(1);
    expect(result.failed ?? []).toHaveLength(0);

    const records = await db
      .select()
      .from(schema.runGeneratedDocuments)
      .where(eq(schema.runGeneratedDocuments.runId, run.id));
    expect(records).toHaveLength(1);

    const text = await readDocxText(await getGeneratedFileBuffer(records[0].storageKey));
    expect(text).toContain('Dear Wile E. Coyote, welcome to VIP status.');
  });

  it('reports success with zero documents when the workflow has no final config', async () => {
    const { workflow } = await factory.createWorkflow(projectId, userId);
    const section = await factory.createSection(workflow.id);
    const textStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Anything',
      alias: 'anything',
    });
    const runId = await createRunWithValue(workflow.id, textStep.id, 'value');

    const result = await runLifecycleService.generateDocuments(runId);

    expect(result.success).toBe(true);
    expect(result.documentsGenerated).toBe(0);
  });

  /**
   * DOC-104 reporting, against the contract TPL-3 established (2026-08-10) and
   * TPL-10 completed. These two cases are deliberately different and must not be
   * collapsed back into one:
   *
   *  - An **aliased-but-unanswered** step is seeded present-as-null by
   *    `RunDataService.buildForRun` (`byAlias`), so `RenderCore`'s `nullGetter`
   *    renders it blank and records it in `unresolvedVariables`. The document is
   *    still produced.
   *  - A **genuinely unknown** tag (a typo, or a deleted question) is NOT in the
   *    data contract, so `nullGetter` raises rather than blanking it — see the
   *    "loud, not blank" comment at `RenderCore.ts` `isUnknownPath`. The document
   *    fails instead of silently shipping a gap in a legal document.
   *
   * The second case is the reason this test previously expected one generated
   * document from an unknown tag: it was written 2026-07-13, before strict
   * undefined existed. Matching unit samples: U1/U2 in
   * `tests/unit/services/document/docSamples.test.ts`.
   */
  // This test was filed skipped by G171-6 against a real product defect:
  // `unresolved_variables` was structurally always `[]`, because normalization
  // collapsed the seeded `null` to `''` and nothing downstream could tell
  // "unanswered" from "answered empty". Fixed by carrying the *names* through
  // to the renderer instead of the nulls — see `normalizeForRender` in
  // `EnhancedDocumentEngine.ts` and `recordEmptyVariable` in `RenderCore.ts`.
  // It is the only end-to-end guard that the recorder actually fires: the unit
  // coverage that missed the defect (`FinalBlockRenderer.test.ts`) hardcodes
  // `unresolvedVariables` inside a mock of the engine. The fast-project
  // companion is `EnhancedDocumentEngine.unresolvedVariables.test.ts`.
  it('records an aliased-but-unanswered variable as unresolved and still generates the document (DOC-104)', async () => {
    const { workflow } = await factory.createWorkflow(projectId, userId);
    const section = await factory.createSection(workflow.id);
    const textStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Client name',
      alias: 'clientName',
      order: 0,
    });
    // Aliased, so it is part of the data contract -- but left unanswered below,
    // so it arrives as null and must be reported rather than raising.
    await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Matter number',
      alias: 'matterNumber',
      order: 1,
    });
    const template = await createTemplateOnDisk(
      'Missing Value Doc',
      'Hello {{clientName}}, matter {{matterNumber}}?'
    );
    await factory.createStep(section.id, {
      type: 'final',
      title: 'Final documents',
      order: 2,
      config: {
        markdownHeader: '',
        documents: [
          { id: 'doc-1', documentId: template.id, alias: 'contract' },
        ],
      },
    });

    // Only clientName is answered; matterNumber has no step_value row.
    const runId = await createRunWithValue(workflow.id, textStep.id, 'Acme Corporation');

    const result = await runLifecycleService.generateDocuments(runId);

    // Generation succeeds -- an unanswered optional field is a degraded document,
    // not a failed one.
    expect(result.success).toBe(true);
    expect(result.documentsGenerated).toBe(1);

    const records = await db
      .select()
      .from(schema.runGeneratedDocuments)
      .where(eq(schema.runGeneratedDocuments.runId, runId));
    expect(records).toHaveLength(1);

    // The unresolved variables list names the unanswered alias, not the answered one.
    expect(records[0].unresolvedVariables).toContain('matterNumber');
    expect(records[0].unresolvedVariables).not.toContain('clientName');

    // The value that WAS supplied still merged, and the gap rendered blank.
    const buffer = await getGeneratedFileBuffer(records[0].storageKey);
    const text = await readDocxText(buffer);
    expect(text).toContain('Hello Acme Corporation, matter ?');
  });

  it('reports an unknown top-level tag as a per-document generation failure (DOC-104)', async () => {
    const { workflow } = await factory.createWorkflow(projectId, userId);
    const section = await factory.createSection(workflow.id);
    const textStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Client name',
      alias: 'clientName',
      order: 0,
    });
    // Template contains {{unknownTag}} which is not provided by the workflow
    const template = await createTemplateOnDisk(
      'Missing Tag Doc',
      'Hello {{clientName}}, where is the {{unknownTag}}?'
    );
    await factory.createStep(section.id, {
      type: 'final',
      title: 'Final documents',
      order: 1,
      config: {
        markdownHeader: '',
        documents: [
          { id: 'doc-1', documentId: template.id, alias: 'contract' },
        ],
      },
    });

    const runId = await createRunWithValue(workflow.id, textStep.id, 'Acme Corporation');

    const result = await runLifecycleService.generateDocuments(runId);

    // TPL-3 deliberately superseded DOC-104's blank-and-record behavior with
    // strict-undefined rendering: one bad template fails without preventing
    // other documents in the Final Block from being attempted.
    expect(result.success).toBe(true);
    expect(result.documentsGenerated).toBe(0);
    expect(result.failed).toEqual([
      expect.objectContaining({
        alias: 'contract',
        details: expect.objectContaining({
          originalError: expect.objectContaining({
            message: expect.stringContaining('undefined variable "unknownTag"'),
          }),
        }),
      }),
    ]);

    // A failed render must not persist a downloadable document record.
    const records = await db
      .select()
      .from(schema.runGeneratedDocuments)
      .where(eq(schema.runGeneratedDocuments.runId, runId));
    expect(records).toHaveLength(0);
  });

  it('marks generation status as failed if template resolver throws (DOC-104)', async () => {
    const { workflow } = await factory.createWorkflow(projectId, userId);
    const section = await factory.createSection(workflow.id);
    const textStep = await factory.createStep(section.id, {
      type: 'short_text',
      title: 'Anything',
      alias: 'anything',
    });
    
    // Provide a non-existent template ID so the resolver throws
    await factory.createStep(section.id, {
      type: 'final',
      title: 'Final documents',
      order: 1,
      config: {
        markdownHeader: '',
        documents: [
          { id: 'doc-1', documentId: '00000000-0000-0000-0000-000000000000', alias: 'missing-template' },
        ],
      },
    });

    const runId = await createRunWithValue(workflow.id, textStep.id, 'value');

    const result = await runLifecycleService.generateDocuments(runId);

    // Overall generation process failed because template resolver threw
    expect(result.success).toBe(false); // The catch block handles this
    expect(result.documentsGenerated).toBe(0);
    expect(result.documents).toBeUndefined();

    // Let's check the run's generationStatus!
    const [run] = await getOwnerDb().select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, runId));
    expect(run.generationStatus).toMatch(/^failed:/);
  });
});
