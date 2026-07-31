import { db } from '../../db';
import { projects, workflows, datavaultDatabases } from '@shared/schema';
import { eq, gt, inArray, and, or, SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { ENTITY_GRAPH, EntityDescriptor } from './entityGraph';
import { BundleWriter } from './bundleWriter';
import { BundleManifest, RequiresReentry, ExportWarning, FORMAT_VERSION, ExportRowLimitError } from './bundleFormat';
import { applyRedaction, scanForSecrets } from './redaction';
import { aclService } from '../AclService';
import { datavaultAclService } from '../DatavaultAclService';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { BlobCollector } from './blobs';

type RootParams = { scope: 'workflow' | 'project' | 'database'; id: string };

type ExportState = {
  writer: BundleWriter;
  extractedIds: Map<string, Set<string>>;
  entityCounts: Record<string, number>;
  blobCollector: BlobCollector;
  requiresReentry: RequiresReentry[];
  warnings: ExportWarning[];
  totalExportedRows: number;
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
  private get batchSize(): number {
    return Number(process.env.PORTABILITY_EXPORT_BATCH_SIZE ?? String(1000));
  }

  private get maxExportRows(): number {
    return Number(process.env.PORTABILITY_MAX_EXPORT_ROWS ?? String(100000));
  }

  async exportToFile(root: RootParams, userId: string): Promise<{ tmpPath: string; manifest: BundleManifest; tenantId: string }> {
    const tenantId = await this.verifyAccessAndGetTenant(root, userId);

    const tmpPath = path.join(os.tmpdir(), `export_${root.scope}_${root.id}_${randomUUID()}.ezb`);
    const writer = new BundleWriter(tmpPath);
    const state: ExportState = {
      writer,
      extractedIds: new Map<string, Set<string>>(),
      entityCounts: {},
      blobCollector: new BlobCollector(writer),
      requiresReentry: [],
      warnings: [],
      totalExportedRows: 0
    };

    let success = false;
    try {
      for (const descriptor of ENTITY_GRAPH) {
        if (!descriptor.scopes.includes(root.scope)) {
          continue;
        }
        await this.processDescriptor(descriptor, root, tenantId, state);
      }

      const manifest: BundleManifest = {
        formatVersion: FORMAT_VERSION,
        appVersion: '1.0.0',
        migrationHead: null,
        scope: root.scope,
        rootIds: [root.id],
        sourceSystem: 'ezBuildr',
        createdAt: new Date().toISOString(),
        entityCounts: state.entityCounts,
        blobCount: state.blobCollector.blobCount,
        checksum: ''
      };
      
      const allWarnings = [...state.blobCollector.warnings, ...state.warnings];
      if (allWarnings.length > 0) {
        manifest.warnings = allWarnings;
      }
      
      if (state.requiresReentry.length > 0) {
        manifest.requiresReentry = state.requiresReentry;
      }
      
      await state.blobCollector.finalize();
      await state.writer.writeManifest(manifest);
      await state.writer.finalize();

      success = true;
      return { tmpPath, manifest, tenantId };
    } finally {
      state.writer.cleanup();
      if (!success) {
        try {
          await fs.promises.rm(tmpPath, { force: true });
        } catch (err) {
          // Ignore removal error
        }
      }
    }
  }

  async export(root: RootParams, userId: string): Promise<Buffer> {
    const { tmpPath } = await this.exportToFile(root, userId);
    try {
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
    const conditions = this.buildConditions(descriptor, root, tableCols, state);
    if (conditions === null) {
      // No parent rows, so no child rows can exist. Skip the query entirely
      // rather than issuing one that cannot match — not every table in the
      // graph has an `id` column to build an impossible predicate from
      // (`workflow_data_sources` has a composite PK).
      state.extractedIds.set(descriptor.name, new Set<string>());
      return;
    }

    if (tableCols['tenantId'] != null) {
      conditions.push(eq(tableCols['tenantId'], tenantId));
    }

    const selection = this.buildSelection(descriptor, tableCols);

    let offset = 0;
    let totalRows = 0;
    const ids = new Set<string>();

    let hasMore = true;
    let lastId: string | undefined = undefined;

    while (hasMore) {
      const page = await this.fetchPage({
        descriptor,
        selection,
        conditions,
        tableCols,
        lastId,
        offset
      });
      const rows = page.rows;
      lastId = page.nextLastId;
      offset = page.nextOffset;
      
      for (const row of rows) {
        state.totalExportedRows++;
        if (state.totalExportedRows > this.maxExportRows) {
          throw new ExportRowLimitError(`Export exceeds the ${this.maxExportRows} row limit`);
        }
        
        totalRows++;
        await this.processRow(descriptor, row as Record<string, unknown>, state, ids);
      }
      
      if (rows.length < this.batchSize) {
        hasMore = false;
      }
    }
    
    state.extractedIds.set(descriptor.name, ids);
    if (totalRows > 0) {
      state.entityCounts[descriptor.name] = totalRows;
    }
  }

  private async fetchPage(params: {
    descriptor: EntityDescriptor;
    selection: Record<string, PgColumn>;
    conditions: SQL<unknown>[];
    tableCols: Record<string, PgColumn>;
    lastId: string | undefined;
    offset: number;
  }): Promise<{ rows: unknown[]; nextLastId: string | undefined; nextOffset: number }> {
    const { descriptor, selection, conditions, tableCols, lastId, offset } = params;
    const idCol = tableCols['id'];
    let rows: unknown[];
    let nextLastId = lastId;
    let nextOffset = offset;

    if (idCol !== undefined) {
      const pageConditions = [...conditions];
      if (lastId !== undefined) {
        pageConditions.push(gt(idCol, lastId));
      }

      rows = await db.select(selection)
        .from(descriptor.table)
        .where(pageConditions.length > 0 ? and(...pageConditions) : undefined)
        .orderBy(idCol)
        .limit(this.batchSize);

      if (rows.length > 0) {
        nextLastId = (rows[rows.length - 1] as Record<string, unknown>).id as string;
      }
    } else {
      const descriptorCols = descriptor.fields.map(f => tableCols[f]);
      const orderCols = tableCols['createdAt'] !== undefined
        ? [tableCols['createdAt'], ...descriptorCols]
        : descriptorCols;

      rows = await db.select(selection)
        .from(descriptor.table)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(...orderCols)
        .limit(this.batchSize)
        .offset(offset);
        
      nextOffset = offset + this.batchSize;
    }
    
    return { rows, nextLastId, nextOffset };
  }

  private async processRow(
    descriptor: EntityDescriptor,
    rowData: Record<string, unknown>,
    state: ExportState,
    ids: Set<string>
  ): Promise<void> {
    if (typeof rowData['id'] === 'string') {
      ids.add(rowData['id']);
    }
    
    await this.processBlobRefs(descriptor, rowData, state);
    this.processRequiresReentry(descriptor, rowData, state);
    
    applyRedaction(rowData, descriptor.redactPaths);
    const scanWarnings = scanForSecrets(descriptor.name, rowData, descriptor.scanPaths);
    for (const warn of scanWarnings) {
      state.warnings.push(warn);
    }
    
    await state.writer.writeEntityRow(descriptor.name, rowData);
  }

  private buildConditions(
    descriptor: EntityDescriptor,
    root: RootParams,
    tableCols: Record<string, PgColumn>,
    state: ExportState
  ): SQL<unknown>[] | null {
    const conditions: SQL<unknown>[] = [];
    const rootTableMap: Record<string, string> = {
      'project': 'projects',
      'workflow': 'workflows',
      'database': 'datavault_databases'
    };
    const rootTableName = rootTableMap[root.scope] ?? '';

    if (rootTableName === descriptor.name) {
      conditions.push(eq(tableCols['id'], root.id));
    } else if (descriptor.name === 'datavault_databases') {
      // datavault_databases has no FK parent; it attaches via (scopeType, scopeId).
      // A project export must also pick up databases scoped to that project's own
      // workflows, or the workflow_queries/writeback_mappings that reference them
      // import as dangling. `workflows` is processed earlier in ENTITY_GRAPH, so
      // its ids are already extracted here.
      const ownScope = and(
        eq(tableCols['scopeType'], root.scope),
        eq(tableCols['scopeId'], root.id)
      );
      const workflowIds = root.scope === 'project'
        ? Array.from(state.extractedIds.get('workflows') ?? new Set<string>())
        : [];

      if (workflowIds.length > 0) {
        const workflowScoped = and(
          eq(tableCols['scopeType'], 'workflow'),
          inArray(tableCols['scopeId'], workflowIds)
        );
        const combined = or(ownScope, workflowScoped);
        if (combined !== undefined) {
          conditions.push(combined);
        }
      } else if (ownScope !== undefined) {
        conditions.push(ownScope);
      }
    } else if (descriptor.parent != null) {
      // Pin invariant: parent must have been processed
      if (!state.extractedIds.has(descriptor.parent.name)) {
        throw new Error(`Topological sort violation: parent '${descriptor.parent.name}' not processed before child '${descriptor.name}'`);
      }
      const parentIds = state.extractedIds.get(descriptor.parent.name) ?? new Set<string>();
      if (parentIds.size === 0) {
        return null;
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
    return conditions;
  }

  private buildSelection(descriptor: EntityDescriptor, tableCols: Record<string, PgColumn>): Record<string, PgColumn> {
    const selection: Record<string, PgColumn> = {};
    for (const field of descriptor.fields) {
      const col = tableCols[field];
      if (col == null) {
        throw new Error(`Field '${field}' defined in ENTITY_GRAPH for '${descriptor.name}' does not exist on the schema table.`);
      }
      selection[field] = col;
    }
    return selection;
  }

  private async processBlobRefs(descriptor: EntityDescriptor, rowData: Record<string, unknown>, state: ExportState): Promise<void> {
    if (descriptor.blobRefs) {
      for (const blobCol of descriptor.blobRefs) {
        const fileRef = rowData[blobCol];
        if (typeof fileRef === 'string' && fileRef) {
          await state.blobCollector.collect(fileRef, descriptor.name, blobCol);
        }
      }
    }
  }

  /**
   * Read a NOT NULL text column off an exported row.
   *
   * These feed `manifest.requiresReentry[]`, which is the only record the
   * importing side gets of what was withheld. An entry that cannot name its
   * secret is worse than a failed export — the user would import a silently
   * unusable workflow — so a missing value is a hard error, not a blank field.
   * Every column read here is NOT NULL, so this fires only on schema drift.
   */
  private requiredString(rowData: Record<string, unknown>, entity: string, column: string): string {
    const value = rowData[column];
    if (typeof value !== 'string') {
      throw new Error(
        `Cannot build re-entry report: '${entity}.${column}' was expected to be a string but was ${typeof value}.`
      );
    }
    return value;
  }

  private processRequiresReentry(descriptor: EntityDescriptor, rowData: Record<string, unknown>, state: ExportState): void {
    if (descriptor.name === 'secrets') {
      const environment = rowData['environment'];
      state.requiresReentry.push({
        type: 'secret',
        entity: 'secrets',
        projectId: this.requiredString(rowData, 'secrets', 'projectId'),
        key: this.requiredString(rowData, 'secrets', 'key'),
        environment: typeof environment === 'string' ? environment : null,
        secretType: this.requiredString(rowData, 'secrets', 'type')
      });
    } else if (descriptor.name === 'connections') {
      state.requiresReentry.push({
        type: 'connection',
        entity: 'connections',
        projectId: this.requiredString(rowData, 'connections', 'projectId'),
        connectionId: this.requiredString(rowData, 'connections', 'id'),
        connectionName: this.requiredString(rowData, 'connections', 'name')
      });
    }
  }
}

export const exportService = new ExportService();
