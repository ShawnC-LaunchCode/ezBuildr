import { db } from '../../db';
import { projects, workflows, datavaultDatabases } from '@shared/schema';
import { eq, inArray, and } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { ENTITY_GRAPH, EntityDescriptor } from './entityGraph';
import { BundleWriter } from './bundleWriter';
import { BundleManifest } from './bundleFormat';
import { aclService } from '../AclService';
import { datavaultAclService } from '../DatavaultAclService';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

type RootParams = { scope: 'workflow' | 'project' | 'database'; id: string };

type ExportState = {
  writer: BundleWriter;
  extractedIds: Map<string, Set<string>>;
  entityCounts: Record<string, number>;
};

/**
 * `projects.tenant_id` is nullable in the schema, so a tenant-less project is
 * representable. Exporting one would push `tenant_id = NULL` into every scope
 * filter, which is never true in SQL — the bundle would come back structurally
 * valid and silently missing every DataVault entity. Fail loudly instead.
 */
function requireTenant(tenantId: string | null, kind: string, id: string): string {
  if (tenantId == null) {
    throw new Error(`Cannot export ${kind} ${id}: it has no tenant assigned.`);
  }
  return tenantId;
}

export class ExportService {
  async export(root: RootParams, userId: string): Promise<Buffer> {
    const tenantId = await this.verifyAccessAndGetTenant(root, userId);

    const tmpPath = path.join(os.tmpdir(), `export_${root.scope}_${root.id}_${randomUUID()}.ezb`);
    const state: ExportState = {
      writer: new BundleWriter(tmpPath),
      extractedIds: new Map<string, Set<string>>(),
      entityCounts: {}
    };

    try {
      for (const descriptor of ENTITY_GRAPH) {
        if (!descriptor.scopes.includes(root.scope)) {
          continue;
        }
        await this.processDescriptor(descriptor, root, tenantId, state);
      }

      const manifest: BundleManifest = {
        formatVersion: 1,
        appVersion: '1.0.0',
        migrationHead: null,
        scope: root.scope,
        rootIds: [root.id],
        sourceSystem: 'ezBuildr',
        createdAt: new Date().toISOString(),
        entityCounts: state.entityCounts,
        blobCount: 0,
        checksum: ''
      };
      await state.writer.writeManifest(manifest);
      await state.writer.finalize();

      return await fs.promises.readFile(tmpPath);
    } finally {
      try {
        await fs.promises.rm(tmpPath, { force: true });
      } catch (err) {
        // Ignore removal error
      }
    }
  }

  private async verifyAccessAndGetTenant(root: RootParams, userId: string): Promise<string> {
    if (root.scope === 'project') {
      const [project] = await db.select().from(projects).where(eq(projects.id, root.id)).limit(1);
      if (project == null) {
        throw new Error('Project not found');
      }
      
      const canView = await aclService.hasProjectRole(userId, root.id, 'view');
      if (!canView) {
        throw new Error('Access denied - insufficient permissions for this project');
      }

      return requireTenant(project.tenantId, 'project', root.id);
    } else if (root.scope === 'workflow') {
      const [workflow] = await db.select().from(workflows).where(eq(workflows.id, root.id)).limit(1);
      if (workflow == null) {
        throw new Error('Workflow not found');
      }

      // `workflows.project_id` is nullable in the schema, so an orphan workflow
      // is representable. Say that, rather than looking up `projects.id = NULL`
      // and reporting "Project not found" for a workflow that plainly exists.
      if (workflow.projectId == null) {
        throw new Error(
          `Cannot export workflow ${root.id}: it is not attached to a project, so no tenant can be resolved for it.`
        );
      }

      const [project] = await db.select().from(projects).where(eq(projects.id, workflow.projectId)).limit(1);
      if (project == null) {
        throw new Error('Project not found');
      }

      const canView = await aclService.hasWorkflowRole(userId, root.id, 'view');
      if (!canView) {
        throw new Error('Access denied - insufficient permissions for this workflow');
      }

      return requireTenant(project.tenantId, 'project', project.id);
    } else if (root.scope === 'database') {
      const [database] = await db.select().from(datavaultDatabases).where(eq(datavaultDatabases.id, root.id)).limit(1);
      if (database == null) {
        throw new Error('Database not found');
      }

      const canView = await datavaultAclService.hasDatabaseRole(userId, root.id, 'view');
      if (!canView) {
        throw new Error('Access denied - insufficient permissions for this database');
      }
      
      return database.tenantId;
    }
    throw new Error('Invalid export scope');
  }

  private async processDescriptor(
    descriptor: EntityDescriptor,
    root: RootParams,
    tenantId: string,
    state: ExportState
  ): Promise<void> {
    const tableCols = descriptor.table as unknown as Record<string, PgColumn>;
    const conditions = [];

    const rootTableMap: Record<string, string> = {
      'project': 'projects',
      'workflow': 'workflows',
      'database': 'datavault_databases'
    };
    const rootTableName = rootTableMap[root.scope] ?? '';

    if (rootTableName === descriptor.name) {
      conditions.push(eq(tableCols['id'], root.id));
    } else if (descriptor.name === 'datavault_databases') {
      conditions.push(eq(tableCols['scopeType'], root.scope));
      conditions.push(eq(tableCols['scopeId'], root.id));
    } else if (descriptor.parent != null) {
      // Pin invariant: parent must have been processed
      if (!state.extractedIds.has(descriptor.parent.name)) {
        throw new Error(`Topological sort violation: parent '${descriptor.parent.name}' not processed before child '${descriptor.name}'`);
      }
      
      const parentIds = state.extractedIds.get(descriptor.parent.name) ?? new Set<string>();
      if (parentIds.size === 0) {
        state.extractedIds.set(descriptor.name, new Set<string>()); // Empty set for children
        return;
      }
      conditions.push(inArray(tableCols[descriptor.parent.fk], Array.from(parentIds)));
    } else {
      // Neither a root for this scope nor reachable from a parent. Emitting it
      // would select the whole table narrowed only by tenant — a silent
      // over-export. A descriptor in this position is a graph bug, so say so.
      throw new Error(
        `Descriptor '${descriptor.name}' is in scope '${root.scope}' but is neither that scope's root nor has a parent; it has no bounded selection.`
      );
    }

    if (tableCols['tenantId'] != null) {
      conditions.push(eq(tableCols['tenantId'], tenantId));
    }

    const selection: Record<string, PgColumn> = {};
    for (const field of descriptor.fields) {
      const col = tableCols[field];
      if (col == null) {
        throw new Error(`Field '${field}' defined in ENTITY_GRAPH for '${descriptor.name}' does not exist on the schema table.`);
      }
      selection[field] = col;
    }

    const query = conditions.length > 0 
      ? db.select(selection).from(descriptor.table).where(and(...conditions))
      : db.select(selection).from(descriptor.table);
      
    const rows = await query;
    const ids = new Set<string>();
    for (const row of rows) {
      const rowData = row as Record<string, unknown>;
      if (typeof rowData['id'] === 'string') {
        ids.add(rowData['id']);
      }
      await state.writer.writeEntityRow(descriptor.name, row);
    }
    
    state.extractedIds.set(descriptor.name, ids);
    if (rows.length > 0) {
      state.entityCounts[descriptor.name] = rows.length;
    }
  }
}

export const exportService = new ExportService();
