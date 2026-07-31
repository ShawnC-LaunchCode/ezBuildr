import { it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../../server/db';
import { createTestFactory, TestFactory } from '../../helpers/testFactory';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { exportService } from '../../../server/services/portability/ExportService';
import { previewBundle } from '../../helpers/bundleTestHelper';
import { BundleReader } from '../../../server/services/portability/bundleReader';
import {
  externalConnections,
  workflows,
  sections,
  steps,
  blocks,
  transformBlocks,
  lifecycleHooks,
  documentHooks,
} from '../../../shared/schema';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Sentinels are distinct per column so a failure names the exact leak path.
 * Each is shaped to trip the scanner it is meant to trip.
 */
const HEADER_SENTINEL = 'sentinel_conn_header_value';
const BLOCK_HEADER_SENTINEL = 'sentinel_block_header_value';
const BLOCK_AUTH_SENTINEL = 'sk-sentinel12345678901234567890auth';
const STEP_CONFIG_SENTINEL = 'ghp_sentinel12345678901234567890step';
const TRANSFORM_SENTINEL = 'sk-sentinel12345678901234567890';
const LIFECYCLE_SENTINEL = 'ghp_sentinel12345678901234567890';
const DOCHOOK_SENTINEL = 'sentinel_dochook_1234567890123456789012345678';

const ALL_SENTINELS = [
  HEADER_SENTINEL,
  BLOCK_HEADER_SENTINEL,
  BLOCK_AUTH_SENTINEL,
  STEP_CONFIG_SENTINEL,
  TRANSFORM_SENTINEL,
  LIFECYCLE_SENTINEL,
  DOCHOOK_SENTINEL,
];

describeWithDb('ExportService - redaction and secret scanning', () => {
  let factory: ReturnType<typeof createTestFactory>;
  let testUserId: string;
  let testTenantId: string;
  let testProjectId: string;
  let testWorkflowId: string;

  beforeEach(async () => {
    factory = createTestFactory();
    await db.transaction(async (tx: unknown) => {
      const txFactory = new TestFactory(tx as ConstructorParameters<typeof TestFactory>[0]);
      const insert = (tx as typeof db).insert.bind(tx as typeof db);

      const { tenant, user, project } = await txFactory.createTenant();
      testTenantId = tenant.id;
      testUserId = user.id;
      testProjectId = project.id;

      const [workflow] = await insert(workflows)
        .values({
          projectId: testProjectId,
          title: 'Redaction Workflow',
          name: 'redaction_workflow',
          slug: `redaction-workflow-${Date.now()}`,
          creatorId: testUserId,
          status: 'active',
        })
        .returning();
      testWorkflowId = workflow.id;

      const [section] = await insert(sections)
        .values({ workflowId: testWorkflowId, title: 'Section', order: 1 })
        .returning();

      // Project-scoped: a header bag with one credential-ish and one benign header.
      await insert(externalConnections).values({
        tenantId: testTenantId,
        projectId: testProjectId,
        name: 'Redact Connection',
        type: 'api_key',
        baseUrl: 'https://api.example.com',
        defaultHeaders: { 'X-Api-Key': HEADER_SENTINEL, Accept: 'application/json' },
        enabled: true,
      });

      // Workflow-scoped: the external_send block's own free-form header bag.
      await insert(blocks).values({
        workflowId: testWorkflowId,
        sectionId: section.id,
        type: 'external_send',
        phase: 'onSectionSubmit',
        config: { 
          headers: [{ key: 'Authorization', value: BLOCK_HEADER_SENTINEL }],
          auth: { token: BLOCK_AUTH_SENTINEL }
        },
        order: 1,
      });

      await insert(steps).values({
        workflowId: testWorkflowId,
        sectionId: section.id,
        type: 'text',
        title: 'Step with secret',
        order: 1,
        config: {
          deep: {
            arrayConfig: [
              { secretValue: STEP_CONFIG_SENTINEL }
            ]
          }
        }
      });

      await insert(transformBlocks).values({
        workflowId: testWorkflowId,
        sectionId: section.id,
        name: 'Transform',
        language: 'javascript',
        outputKey: 'transform_out',
        code: `const token = "${TRANSFORM_SENTINEL}";`,
        phase: 'onSectionSubmit',
        order: 1,
      });

      await insert(lifecycleHooks).values({
        workflowId: testWorkflowId,
        sectionId: section.id,
        name: 'Lifecycle',
        language: 'javascript',
        code: `const credential = "${LIFECYCLE_SENTINEL}";`,
        phase: 'afterPage',
        order: 1,
      });

      await insert(documentHooks).values({
        workflowId: testWorkflowId,
        finalBlockDocumentId: 'doc-template-1',
        name: 'Doc Hook',
        language: 'javascript',
        code: `const my_api_key = "${DOCHOOK_SENTINEL}";`,
        phase: 'afterGeneration',
        order: 1,
      });
    });
  });

  afterEach(async () => {
    await factory.cleanup({ tenantIds: [testTenantId] });
  });

  async function loadBundle(buffer: Buffer) {
    const tmpPath = path.join(os.tmpdir(), `test_bundle_redaction_${Date.now()}_${Math.random()}.ezb`);
    await fs.promises.writeFile(tmpPath, buffer);
    const reader = new BundleReader(tmpPath);
    await reader.open();
    return { reader, tmpPath };
  }

  async function collect(stream: AsyncIterable<unknown>) {
    const rows: Record<string, unknown>[] = [];
    for await (const row of stream) {
      rows.push(row as Record<string, unknown>);
    }
    return { rows, raw: rows.map((r) => JSON.stringify(r)).join('\n') };
  }

  // `connections` is project-scoped while `blocks` and the hook tables are
  // workflow-scoped, so no single export contains both. Each test uses the
  // scope that actually reaches the rows it asserts on — a project-scope
  // export has no blocks in it at all, and an assertion against one would
  // pass vacuously.

  it('blanks connection header values while keeping the header names', async () => {
    const buffer = await exportService.export({ scope: 'project', id: testProjectId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);

    const { rows, raw } = await collect(reader.readEntityStream('connections'));
    expect(rows).toHaveLength(1);
    expect(rows[0]['name']).toBe('Redact Connection');
    // Names survive so the import preview can say what must be re-entered;
    // values do not. Compared as an object — jsonb key order is not ours.
    expect(rows[0]['defaultHeaders']).toEqual({ 'X-Api-Key': null, Accept: null });
    expect(raw).not.toContain(HEADER_SENTINEL);

    await fs.promises.rm(tmpPath);
  });

  it('blanks external_send block header values while keeping the header names', async () => {
    const buffer = await exportService.export({ scope: 'workflow', id: testWorkflowId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);

    const { rows, raw } = await collect(reader.readEntityStream('blocks'));
    expect(rows).toHaveLength(1);
    expect(rows[0]['type']).toBe('external_send');
    expect(rows[0]['config']).toEqual({ 
      headers: [{ key: 'Authorization', value: null }],
      auth: { token: BLOCK_AUTH_SENTINEL } 
    });
    expect(raw).not.toContain(BLOCK_HEADER_SENTINEL);

    await fs.promises.rm(tmpPath);
  });

  it('warns on secret-shaped literals in JSON config columns, without redacting them', async () => {
    const buffer = await exportService.export({ scope: 'workflow', id: testWorkflowId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);

    const warnings = reader.manifest.warnings ?? [];
    
    const blockWarning = warnings.find((w) => w.type === 'secret_scan' && w.entity === 'blocks');
    expect(blockWarning, 'expected a secret_scan warning for blocks').toBeDefined();
    expect(blockWarning).toMatchObject({ type: 'secret_scan', entity: 'blocks', column: 'config' });

    const stepWarning = warnings.find((w) => w.type === 'secret_scan' && w.entity === 'steps');
    expect(stepWarning, 'expected a secret_scan warning for steps').toBeDefined();
    expect(stepWarning).toMatchObject({ type: 'secret_scan', entity: 'steps', column: 'config' });

    // The JSON code itself is deliberately not redacted — it is the workflow config.
    const { raw: blockRaw } = await collect(reader.readEntityStream('blocks'));
    expect(blockRaw).toContain(BLOCK_AUTH_SENTINEL);

    const { raw: stepRaw } = await collect(reader.readEntityStream('steps'));
    expect(stepRaw).toContain(STEP_CONFIG_SENTINEL);

    // AC 4, second half: the bundle must still import. Scanning adds entries to
    // manifest.warnings, and IEX2-8 showed that a warning shape missing from
    // manifestSchema makes the reader reject the whole bundle -- so asserting
    // the export is non-destructive is not enough on its own.
    const preview = await previewBundle(buffer, testUserId);
    expect(preview.canProceed).toBe(true);

    await fs.promises.rm(tmpPath);
  });

  it('warns on secret-shaped literals in every code column, and the export still succeeds', async () => {
    const buffer = await exportService.export({ scope: 'workflow', id: testWorkflowId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);

    const warnings = reader.manifest.warnings ?? [];
    for (const entity of ['transform_blocks', 'lifecycle_hooks', 'document_hooks']) {
      const warning = warnings.find((w) => w.type === 'secret_scan' && w.entity === entity);
      expect(warning, `expected a secret_scan warning for ${entity}`).toBeDefined();
      expect(warning).toMatchObject({ type: 'secret_scan', entity, column: 'code', line: 1 });
    }

    // The code itself is deliberately not redacted — it is the workflow.
    const { raw } = await collect(reader.readEntityStream('transform_blocks'));
    expect(raw).toContain(TRANSFORM_SENTINEL);

    await fs.promises.rm(tmpPath);
  });

  it('never repeats the matched secret anywhere in the manifest', async () => {
    const buffer = await exportService.export({ scope: 'workflow', id: testWorkflowId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);

    // A leak detector that quotes the leak is worse than none: the manifest is
    // the part a user is most likely to paste into a ticket or a chat.
    const manifestStr = JSON.stringify(reader.manifest);
    for (const sentinel of ALL_SENTINELS) {
      expect(manifestStr).not.toContain(sentinel);
    }

    await fs.promises.rm(tmpPath);
  });
});
