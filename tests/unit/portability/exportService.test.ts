import { it, expect, beforeEach, afterEach, describe, vi } from 'vitest';
import { db } from '../../../server/db';
import { createTestFactory, TestFactory } from '../../helpers/testFactory';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { exportService } from '../../../server/services/portability/ExportService';
import { BundleReader } from '../../../server/services/portability/bundleReader';
import { ENTITY_GRAPH } from '../../../server/services/portability/entityGraph';
import { datavaultDatabases, datavaultTables, datavaultColumns, datavaultRows, datavaultValues, workflowDataSources } from '../../../shared/schema';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describeWithDb('ExportService', () => {
  let factory: ReturnType<typeof createTestFactory>;
  let testUserId: string;
  let testTenantId: string;
  let testProjectId: string;
  let testWorkflowId: string;
  
  let otherUserId: string;
  let otherTenantId: string;
  let testDatabaseId: string;

  beforeEach(async () => {
    factory = createTestFactory();
    await db.transaction(async (tx: unknown) => {
      const txFactory = new TestFactory(tx as ConstructorParameters<typeof TestFactory>[0]);
      
      const { tenant, user, project } = await txFactory.createTenant();
      testTenantId = tenant.id;
      testUserId = user.id;
      testProjectId = project.id;

      const { workflow } = await txFactory.createWorkflow(project.id, user.id, {
        workflow: { name: 'Test Workflow' },
      });
      testWorkflowId = workflow.id;

      const page = await txFactory.createPage(testWorkflowId, { title: 'Test Page' });
      await txFactory.createStep(page.id, { type: 'text', title: 'Test Question' });

      const other = await txFactory.createTenant();
      otherUserId = other.user.id;
      otherTenantId = other.tenant.id;
      
      // Deliberately plant a legitimate same-tenant datavault database linked to our project
      const [validDb] = await (tx as any).insert(datavaultDatabases).values({
        tenantId: testTenantId,
        name: 'Valid Tenant DB',
        description: 'Should be exported',
        type: 'native',
        config: {},
        scopeType: 'project',
        scopeId: project.id,
        ownerType: 'user',
        ownerUuid: testUserId
      }).returning();
      testDatabaseId = validDb.id;

      // Deliberately plant a cross-tenant datavault database linked to our project
      await (tx as any).insert(datavaultDatabases).values({
        tenantId: otherTenantId, // different tenant
        name: 'Cross Tenant DB',
        description: 'Should not be exported',
        type: 'native',
        config: {},
        scopeType: 'project',
        scopeId: project.id, // linked to our project
        ownerType: 'user',
        ownerUuid: otherUserId
      });
    });
  });

  const origBatchSize = process.env.PORTABILITY_EXPORT_BATCH_SIZE;
  const origMaxRows = process.env.PORTABILITY_MAX_EXPORT_ROWS;

  afterEach(async () => {
    await factory.cleanup({ tenantIds: [testTenantId, otherTenantId] });
    
    if (origBatchSize === undefined) {
      delete process.env.PORTABILITY_EXPORT_BATCH_SIZE;
    } else {
      process.env.PORTABILITY_EXPORT_BATCH_SIZE = origBatchSize;
    }

    if (origMaxRows === undefined) {
      delete process.env.PORTABILITY_MAX_EXPORT_ROWS;
    } else {
      process.env.PORTABILITY_MAX_EXPORT_ROWS = origMaxRows;
    }
  });

  async function loadBundle(buffer: Buffer) {
    const tmpPath = path.join(os.tmpdir(), `test_bundle_${Date.now()}_${Math.random()}.ezb`);
    await fs.promises.writeFile(tmpPath, buffer);
    const reader = new BundleReader(tmpPath);
    await reader.open();
    return { reader, tmpPath };
  }

  async function assertFieldsStrictlyMatch(reader: BundleReader) {
    const graphMap = new Map<string, string[]>();
    for (const d of ENTITY_GRAPH) {
      graphMap.set(d.name, [...d.fields].sort());
    }

    for (const entityName of Object.keys(reader.manifest.entityCounts)) {
      const expectedFields = graphMap.get(entityName);
      if (!expectedFields) {
        throw new Error(`Unknown entity in bundle: ${entityName}`);
      }
      
      for await (const row of reader.readEntityStream(entityName)) {
        const actualFields = Object.keys(row as Record<string, unknown>).sort();
        expect(actualFields).toEqual(expectedFields);
      }
    }
  }

  describe('Graph invariants', () => {
    it('ENTITY_GRAPH is strictly topologically sorted', () => {
      const seen = new Set<string>();
      const outOfOrder: string[] = [];
      for (const descriptor of ENTITY_GRAPH) {
        if (descriptor.parent && !seen.has(descriptor.parent.name)) {
          outOfOrder.push(`${descriptor.name} before its parent ${descriptor.parent.name}`);
        }
        seen.add(descriptor.name);
      }

      expect(
        outOfOrder,
        'ENTITY_GRAPH is walked in array order and children read their parent\'s ' +
        'extracted ids, so a parent must appear first. Reorder the offenders.'
      ).toEqual([]);
    });

    it('every descriptor is reachable in each scope it declares', () => {
      // The walk skips descriptors whose scopes exclude the root scope. So a
      // descriptor is only reachable in a scope if it is that scope's root
      // table, or its parent is also present in that scope — otherwise the
      // parent is skipped and the child throws a topological-sort violation at
      // runtime. `workflows` is the reason for the root-table clause: it
      // declares 'workflow' while its parent `projects` does not, which is
      // correct because at workflow scope it IS the root and never reads a
      // parent's ids.
      // The third exemption, alongside the root-table clause: a descriptor
      // whose ids `buildConditions` selects from a reference set collected up
      // front rather than from a parent's extracted ids
      // (`ExportService.collectWorkflowRefs`, IEX3-1). `templates` declares
      // 'workflow' while its parent `projects` does not, which is correct
      // because at workflow scope it never reads a parent's ids -- it is
      // bounded by the ids `workflow_templates` references. Keep this in step
      // with REFERENCE_BOUNDED in entityGraph.test.ts.
      const referenceBoundedForScope: Record<string, string[]> = {
        workflow: ['templates'],
      };
      const rootTableForScope: Record<string, string> = {
        project: 'projects',
        workflow: 'workflows',
        database: 'datavault_databases',
      };
      const byName = new Map(ENTITY_GRAPH.map(d => [d.name, d]));
      const unreachable: string[] = [];

      for (const descriptor of ENTITY_GRAPH) {
        if (descriptor.parent == null) {
          continue;
        }
        const parent = byName.get(descriptor.parent.name);
        for (const scope of descriptor.scopes) {
          if (rootTableForScope[scope] === descriptor.name) {
            continue;
          }
          if ((referenceBoundedForScope[scope] ?? []).includes(descriptor.name)) {
            continue;
          }
          if (parent && !parent.scopes.includes(scope)) {
            unreachable.push(`${descriptor.name} declares scope '${scope}' but parent ${parent.name} does not`);
          }
        }
      }

      expect(
        unreachable,
        'A descriptor must be its scope\'s root table, or share the scope with its parent.'
      ).toEqual([]);
    });
  });

  it('exports a workflow and returns correct subset of entities with strictly correct fields', async () => {
    const buffer = await exportService.export({ scope: 'workflow', id: testWorkflowId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);
    
    expect(reader.manifest.scope).toBe('workflow');
    expect(reader.manifest.rootIds).toEqual([testWorkflowId]);
    
    await assertFieldsStrictlyMatch(reader);
    
    // Check workflows emitted
    const workflows: any[] = [];
    for await (const w of reader.readEntityStream('workflows')) {
      workflows.push(w);
    }
    expect(workflows.length).toBe(1);
    expect(workflows[0].id).toBe(testWorkflowId);
    expect(workflows[0].name).toBe('Test Workflow');
    
    const pages: any[] = [];
    for await (const s of reader.readEntityStream('pages')) {
      pages.push(s);
    }
    expect(pages.length).toBe(1);
    
    const steps: any[] = [];
    for await (const s of reader.readEntityStream('steps')) {
      steps.push(s);
    }
    expect(steps.length).toBe(1);
    
    expect(reader.manifest.entityCounts['workflows']).toBe(1);
    expect(reader.manifest.entityCounts['pages']).toBe(1);
    expect(reader.manifest.entityCounts['steps']).toBe(1);

    await fs.promises.rm(tmpPath);
  });

  it('stamps real appVersion and migrationHead into the manifest', async () => {
    // We cannot easily spy on fs.readFileSync due to ESM module constraints.
    // However, ExportService uses process.cwd() to locate package.json and _journal.json.
    // By mocking process.cwd(), we can redirect it to a temporary directory with our fake files.
    const tempDir = path.join(os.tmpdir(), `ezbuildr-test-${Date.now()}`);
    await fs.promises.mkdir(path.join(tempDir, 'migrations', 'meta'), { recursive: true });
    
    await fs.promises.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ version: '9.9.9' })
    );
    await fs.promises.writeFile(
      path.join(tempDir, 'migrations', 'meta', '_journal.json'),
      JSON.stringify({ entries: [{ tag: '0099_test_migration' }] })
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);

    const buffer = await exportService.export({ scope: 'workflow', id: testWorkflowId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);
    
    expect(reader.manifest.appVersion).toBe('9.9.9');
    expect(reader.manifest.migrationHead).toBe('0099_test_migration');

    cwdSpy.mockRestore();
    await fs.promises.rm(tmpPath);
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('exports a project and its descendants', async () => {
    const buffer = await exportService.export({ scope: 'project', id: testProjectId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);
    
    expect(reader.manifest.scope).toBe('project');
    await assertFieldsStrictlyMatch(reader);
    
    const projs: any[] = [];
    for await (const p of reader.readEntityStream('projects')) {
      projs.push(p);
    }
    expect(projs.length).toBe(1);
    expect(projs[0].id).toBe(testProjectId);
    
    const workflows: any[] = [];
    for await (const w of reader.readEntityStream('workflows')) {
      workflows.push(w);
    }
    expect(workflows.length).toBe(1);

    await fs.promises.rm(tmpPath);
  });

  it('throws Project not found for non-existent root', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    await expect(
      exportService.export({ scope: 'project', id: nonExistentId }, testUserId)
    ).rejects.toThrow('Project not found');
  });

  it('throws Access denied for unauthorized user', async () => {
    await expect(
      exportService.export({ scope: 'workflow', id: testWorkflowId }, otherUserId)
    ).rejects.toThrow('Access denied');
  });

  it('prevents cross-tenant data leakage even with matching FK', async () => {
    const buffer = await exportService.export({ scope: 'project', id: testProjectId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);
    
    await assertFieldsStrictlyMatch(reader);

    const dbs: any[] = [];
    for await (const db of reader.readEntityStream('datavault_databases')) {
      dbs.push(db);
    }
    
    // Exactly 1 DB should be exported: the valid tenant DB. The cross tenant DB is ignored.
    expect(dbs.length).toBe(1);
    expect(dbs[0].name).toBe('Valid Tenant DB');

    await fs.promises.rm(tmpPath);
  });
  it('cleans up temp directory even if export fails (AC 4)', async () => {
    const { BundleWriter } = await import('../../../server/services/portability/bundleWriter');
    
    let capturedTmpDir = '';
    
    vi.spyOn(BundleWriter.prototype, 'writeEntityRow').mockImplementation(function(this: any) {
      capturedTmpDir = this.tmpDir;
      throw new Error('Simulated export failure');
    });

    await expect(
      exportService.export({ scope: 'project', id: testProjectId }, testUserId)
    ).rejects.toThrow('Simulated export failure');

    expect(capturedTmpDir).not.toBe('');
    expect(fs.existsSync(capturedTmpDir)).toBe(false);
  });

  it('batches reads and tracks extracted ids correctly across batches (AC 2 & 3)', async () => {
    // AC 2: span at least three batches
    process.env.PORTABILITY_EXPORT_BATCH_SIZE = '2';
    process.env.PORTABILITY_MAX_EXPORT_ROWS = '1000';

    const [table] = await db.insert(datavaultTables).values({
      tenantId: testTenantId,
      databaseId: testDatabaseId,
      name: 'Test Table',
      slug: 'test-table'
    }).returning();

    const [col] = await db.insert(datavaultColumns).values({
      tableId: table.id,
      name: 'Col1',
      slug: 'col1',
      type: 'text'
    }).returning();

    // 5 rows = 3 batches when BATCH_SIZE=2
    for (let i = 0; i < 5; i++) {
      const [row] = await db.insert(datavaultRows).values({
        tableId: table.id,
        createdBy: testUserId,
        updatedBy: testUserId
      }).returning();

      await db.insert(datavaultValues).values({
        rowId: row.id,
        columnId: col.id,
        value: `val${i}`,
      });
    }

    const buffer = await exportService.export({ scope: 'project', id: testProjectId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);

    expect(reader.manifest.entityCounts['datavault_rows']).toBe(5);
    expect(reader.manifest.entityCounts['datavault_values']).toBe(5);

    let rowCount = 0;
    for await (const _r of reader.readEntityStream('datavault_rows')) {
      rowCount++;
    }
    expect(rowCount).toBe(5);

    let valCount = 0;
    for await (const _v of reader.readEntityStream('datavault_values')) {
      valCount++;
    }
    expect(valCount).toBe(5);

    await fs.promises.rm(tmpPath);
  });

  it('exports workflow_data_sources with composite PK across batches (AC 4)', async () => {
    process.env.PORTABILITY_EXPORT_BATCH_SIZE = '2';

    for (let i = 0; i < 5; i++) {
      const [dbSource] = await db.insert(datavaultDatabases).values({
        tenantId: testTenantId,
        scopeType: 'project',
        scopeId: testProjectId,
        name: `Test DB ${i}`,
        ownerType: 'user',
        ownerUuid: testUserId
      }).returning();
      
      await db.insert(workflowDataSources).values({
        workflowId: testWorkflowId,
        dataSourceId: dbSource.id
      });
    }

    const buffer = await exportService.export({ scope: 'workflow', id: testWorkflowId }, testUserId);
    const { reader, tmpPath } = await loadBundle(buffer);

    expect(reader.manifest.entityCounts['workflow_data_sources']).toBe(5);

    let sourceCount = 0;
    for await (const _ds of reader.readEntityStream('workflow_data_sources')) {
      sourceCount++;
    }
    expect(sourceCount).toBe(5);

    await fs.promises.rm(tmpPath);
  });

  it('enforces row ceiling limit and throws classified error (AC 5)', async () => {
    process.env.PORTABILITY_MAX_EXPORT_ROWS = '1';
    await expect(
      exportService.export({ scope: 'project', id: testProjectId }, testUserId)
    ).rejects.toThrow('Export exceeds the 1 row limit');
  });
});
