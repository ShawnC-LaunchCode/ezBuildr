import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import { db } from '../../../server/db';
import { createTestFactory, TestFactory } from '../../helpers/testFactory';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { exportService } from '../../../server/services/portability/ExportService';
import { BundleReader } from '../../../server/services/portability/bundleReader';
import { ENTITY_GRAPH } from '../../../server/services/portability/entityGraph';
import { datavaultDatabases } from '../../../shared/schema';
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

      const section = await txFactory.createSection(testWorkflowId, { title: 'Test Section' });
      await txFactory.createStep(section.id, { type: 'short_text', title: 'Test Question' });

      const other = await txFactory.createTenant();
      otherUserId = other.user.id;
      otherTenantId = other.tenant.id;
      
      // Deliberately plant a legitimate same-tenant datavault database linked to our project
      await (tx as any).insert(datavaultDatabases).values({
        tenantId: testTenantId,
        name: 'Valid Tenant DB',
        description: 'Should be exported',
        type: 'native',
        config: {},
        scopeType: 'project',
        scopeId: project.id,
        ownerType: 'user',
        ownerUuid: testUserId
      });

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

  afterEach(async () => {
    await factory.cleanup({ tenantIds: [testTenantId, otherTenantId] });
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
    
    const sections: any[] = [];
    for await (const s of reader.readEntityStream('sections')) {
      sections.push(s);
    }
    expect(sections.length).toBe(1);
    
    const steps: any[] = [];
    for await (const s of reader.readEntityStream('steps')) {
      steps.push(s);
    }
    expect(steps.length).toBe(1);
    
    expect(reader.manifest.entityCounts['workflows']).toBe(1);
    expect(reader.manifest.entityCounts['sections']).toBe(1);
    expect(reader.manifest.entityCounts['steps']).toBe(1);

    await fs.promises.rm(tmpPath);
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
});
