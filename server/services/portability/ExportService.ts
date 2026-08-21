import { db } from '../../db';
import { withCurrentTenant } from '../../utils/rlsContext';
import {
  projects, workflows, datavaultDatabases, datavaultTables, datavaultColumns,
  workflowTemplates, workflowVersions, workflowDataSources, workflowQueries,
  steps, blocks
} from '@shared/schema';
import { collectConfigEntityRefs } from '@shared/types/stepConfigRefs';
import { eq, gt, inArray, and, or, SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { ENTITY_GRAPH, EntityDescriptor } from './entityGraph';
import { BundleWriter } from './bundleWriter';
import { BundleManifest, RequiresReentry, ExportWarning, FORMAT_VERSION, ExportRowLimitError } from './bundleFormat';
import { getMigrationHead } from './migrationHead';
import { applyRedaction, scanForSecrets } from './redaction';
import { aclService } from '../AclService';
import { datavaultAclService } from '../DatavaultAclService';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { BlobCollector } from './blobs';

type RootParams = { scope: 'workflow' | 'project' | 'database'; id: string };

/**
 * Entities a workflow-scope export must reach that it cannot descend to
 * through a parent chain, resolved before the main pass (IEX3-1).
 *
 * `templates` hangs off `projects`, which is not in workflow scope, and a
 * DataVault database attaches by `(scopeType, scopeId)` rather than an FK — so
 * neither is reachable from a workflow root by the generic parent walk. Both
 * are collected here by *reference* instead: what does this workflow actually
 * use.
 */
type WorkflowRefs = {
  templateIds: Set<string>;
  /** Referenced databases the caller is allowed to export; see collectWorkflowRefs. */
  allowedDatabaseIds: Set<string>;
};

type ExportState = {
  writer: BundleWriter;
  extractedIds: Map<string, Set<string>>;
  entityCounts: Record<string, number>;
  blobCollector: BlobCollector;
  requiresReentry: RequiresReentry[];
  warnings: ExportWarning[];
  totalExportedRows: number;
  workflowRefs: WorkflowRefs;
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

  private getAppVersion(): string {
    const packagePath = path.resolve(process.cwd(), 'package.json');
    if (!fs.existsSync(packagePath)) {
      throw new Error(`package.json not found at ${packagePath}`);
    }
    const content = fs.readFileSync(packagePath, 'utf8');
    const pkg = JSON.parse(content) as Record<string, unknown>;
    if (typeof pkg.version !== 'string') {
      throw new Error('package.json does not contain a valid version string');
    }
    return pkg.version;
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
      totalExportedRows: 0,
      workflowRefs: { templateIds: new Set<string>(), allowedDatabaseIds: new Set<string>() }
    };

    let success = false;
    try {
      if (root.scope === 'workflow') {
        await this.collectWorkflowRefs(root.id, userId, state);
      }

      for (const descriptor of ENTITY_GRAPH) {
        if (!descriptor.scopes.includes(root.scope)) {
          continue;
        }
        await this.processDescriptor(descriptor, root, tenantId, state);
      }

      const manifest: BundleManifest = {
        formatVersion: FORMAT_VERSION,
        appVersion: this.getAppVersion(),
        migrationHead: getMigrationHead(),
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

  /**
   * The manifest an export *would* produce, without keeping the bytes.
   *
   * Backs the pre-download disclosure (IEX3-4): the counts, the withheld
   * secrets and the secret-scan warnings are all computed during a real
   * export, and until now were only readable by downloading the zip and
   * opening `manifest.json` inside it — i.e. after the decision they are
   * meant to inform.
   *
   * Deliberately runs the *full* export rather than estimating. An estimate
   * that disagreed with the file would be worse than no disclosure at all,
   * and the warnings only exist because rows were actually read and scanned.
   * The temp file is removed before returning.
   */
  async computeManifest(root: RootParams, userId: string): Promise<BundleManifest> {
    const { tmpPath, manifest } = await this.exportToFile(root, userId);
    try {
      return manifest;
    } finally {
      await fs.promises.rm(tmpPath, { force: true });
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
    // RLS-5: `projects`/`workflows`/`datavault_databases` are all RLS-covered,
    // and these reads ran on the bare pool — so under a non-owner role they
    // returned zero rows and every export 404'd as "not found" for a project
    // the caller plainly owns.
    //
    // The ACL checks get their OWN transaction rather than sharing this one.
    // Both ACL services already thread `tx` all the way down, so they need a
    // tenant scope of their own (their reads hit `projects`/`workflows` too,
    // and unscoped they deny access to resources the caller owns — a 403 where
    // the unscoped row read gave a 404). They must NOT run inside the read
    // transaction below: a second query issued while that transaction holds
    // the only connection is the `SystemStats` deadlock, and against the max:1
    // test pool it HANGS rather than failing. Measured here, not theorised.
    const found = await withCurrentTenant(async (tx) => {
      if (root.scope === 'project') {
        const [project] = await tx.select().from(projects).where(eq(projects.id, root.id)).limit(1);
        return { kind: 'project' as const, project };
      }
      if (root.scope === 'workflow') {
        const [workflow] = await tx.select().from(workflows).where(eq(workflows.id, root.id)).limit(1);
        if (workflow == null) {
          return { kind: 'workflow' as const, workflow: undefined, project: undefined };
        }
        if (workflow.projectId == null) {
          return { kind: 'workflow' as const, workflow, project: undefined };
        }
        const [project] = await tx.select().from(projects).where(eq(projects.id, workflow.projectId)).limit(1);
        return { kind: 'workflow' as const, workflow, project };
      }
      if (root.scope === 'database') {
        const [database] = await tx.select().from(datavaultDatabases).where(eq(datavaultDatabases.id, root.id)).limit(1);
        return { kind: 'database' as const, database };
      }
      return { kind: 'invalid' as const };
    });

    if (found.kind === 'project') {
      if (found.project == null) {
        throw new Error('Project not found');
      }
      const canEdit = await withCurrentTenant((tx) =>
        aclService.hasProjectRole(userId, root.id, 'edit', tx));
      if (!canEdit) {
        throw new Error('Access denied - insufficient permissions for this project');
      }
      return requireTenant(found.project.tenantId, 'project', root.id);
    }

    if (found.kind === 'workflow') {
      if (found.workflow == null) {
        throw new Error('Workflow not found');
      }
      // `workflows.project_id` is nullable in the schema, so an orphan workflow
      // is representable. Say that, rather than looking up `projects.id = NULL`
      // and reporting "Project not found" for a workflow that plainly exists.
      if (found.workflow.projectId == null) {
        throw new Error(
          `Cannot export workflow ${root.id}: it is not attached to a project, so no tenant can be resolved for it.`
        );
      }
      if (found.project == null) {
        throw new Error('Project not found');
      }
      const canEdit = await withCurrentTenant((tx) =>
        aclService.hasWorkflowRole(userId, root.id, 'edit', tx));
      if (!canEdit) {
        throw new Error('Access denied - insufficient permissions for this workflow');
      }
      return requireTenant(found.project.tenantId, 'project', found.project.id);
    }

    if (found.kind === 'database') {
      if (found.database == null) {
        throw new Error('Database not found');
      }
      const canEdit = await withCurrentTenant((tx) =>
        datavaultAclService.hasDatabaseRole(userId, root.id, 'edit', tx));
      if (!canEdit) {
        throw new Error('Access denied - insufficient permissions for this database');
      }
      return found.database.tenantId;
    }

    throw new Error('Invalid export scope');
  }

  /**
   * Resolve what a workflow-scope export must additionally carry: the
   * templates its `workflow_templates` rows point at, and the DataVault
   * databases its data sources and queries point at.
   *
   * Templates need no extra authorization check. The caller already holds
   * `edit` on the workflow, and a workflow's own templates are the documents
   * it exists to produce — withholding them would make the common case
   * (export a workflow, reuse it as a baseline) fail by design.
   *
   * Databases are different and are ACL-checked. A workflow may bind to a
   * `project`- or `account`-scoped database that is shared with the rest of
   * the tenant, so sweeping it in on the strength of workflow-edit alone would
   * let anyone with edit on one workflow exfiltrate a tenant-wide DataVault by
   * pointing a question at it. IEX2-17 already settled that exporting a
   * database requires `edit` on that database (inherited from the project
   * where applicable); this reuses that gate. Databases the workflow *owns*
   * (`scopeType='workflow'` and this workflow's id) are excluded from the
   * check -- they are covered by the ownership predicate in `buildConditions`
   * and have always exported without one.
   */
  private async collectWorkflowRefs(workflowId: string, userId: string, state: ExportState): Promise<void> {
    const templateRows = await db
      .select({ templateId: workflowTemplates.templateId })
      .from(workflowTemplates)
      .innerJoin(workflowVersions, eq(workflowTemplates.workflowVersionId, workflowVersions.id))
      .where(eq(workflowVersions.workflowId, workflowId));
    for (const row of templateRows) {
      state.workflowRefs.templateIds.add(row.templateId);
    }

    const candidateDatabaseIds = await this.collectReferencedDatabaseIds(workflowId);
    if (candidateDatabaseIds.size === 0) {
      return;
    }

    const candidates = await db
      .select({
        id: datavaultDatabases.id,
        name: datavaultDatabases.name,
        scopeType: datavaultDatabases.scopeType,
        scopeId: datavaultDatabases.scopeId
      })
      .from(datavaultDatabases)
      .where(inArray(datavaultDatabases.id, Array.from(candidateDatabaseIds)));

    for (const candidate of candidates) {
      if (candidate.scopeType === 'workflow' && candidate.scopeId === workflowId) {
        continue; // already selected by the ownership predicate
      }
      const canExport = await datavaultAclService.hasDatabaseRole(userId, candidate.id, 'edit');
      if (canExport) {
        state.workflowRefs.allowedDatabaseIds.add(candidate.id);
      } else {
        state.warnings.push({
          type: 'dangling_reference',
          entity: 'datavault_databases',
          column: 'id',
          missingId: candidate.id,
          message:
            `DataVault database "${candidate.name}" is used by this workflow but was not exported: ` +
            `it is ${candidate.scopeType}-scoped and you do not have edit access to it. ` +
            `Anything in this workflow that points at it will need re-connecting after importing.`
        });
      }
    }
  }

  /**
   * DataVault ids named inside `steps.config` / `blocks.config` (IEX3-B5).
   *
   * A choice question can be bound straight to a table through
   * `dynamicOptions`, and a Read Table or Write block through its own config,
   * without the workflow ever registering that database as a data source. Those
   * bindings were outside every collection route below, so the database did not
   * travel and the import reported a broken reference — correct behaviour, but
   * the bundle was needlessly incomplete and the export's "what travels" list
   * said nothing about it.
   *
   * Uses the same collector the importer validates with, so the two cannot
   * disagree about what counts as a reference. A config may name a table or a
   * column without naming its database, so both are resolved upward.
   */
  private async collectConfigDatabaseIds(workflowId: string): Promise<Set<string>> {
    const [stepRows, blockRows] = await Promise.all([
      db.select({ config: steps.config }).from(steps).where(eq(steps.workflowId, workflowId)),
      db.select({ config: blocks.config }).from(blocks).where(eq(blocks.workflowId, workflowId))
    ]);

    const databaseIds = new Set<string>();
    const tableIds = new Set<string>();
    const columnIds = new Set<string>();

    for (const row of [...stepRows, ...blockRows]) {
      if (row.config == null) {
        continue;
      }
      for (const ref of collectConfigEntityRefs(row.config)) {
        if (ref.entity === 'datavault_databases') { databaseIds.add(ref.id); }
        else if (ref.entity === 'datavault_tables') { tableIds.add(ref.id); }
        else if (ref.entity === 'datavault_columns') { columnIds.add(ref.id); }
      }
    }

    if (columnIds.size > 0) {
      const cols = await db.select({ tableId: datavaultColumns.tableId })
        .from(datavaultColumns)
        .where(inArray(datavaultColumns.id, Array.from(columnIds)));
      for (const col of cols) {
        tableIds.add(col.tableId);
      }
    }
    if (tableIds.size > 0) {
      const tables = await db.select({ databaseId: datavaultTables.databaseId })
        .from(datavaultTables)
        .where(inArray(datavaultTables.id, Array.from(tableIds)));
      for (const table of tables) {
        // `datavault_tables.database_id` is nullable in the schema, so a
        // parentless table is representable and simply reaches no database.
        if (table.databaseId !== null) {
          databaseIds.add(table.databaseId);
        }
      }
    }

    // A config may name an id that no longer exists; the lookups above simply
    // return nothing for those, and a stale id never reaches the ACL gate.
    return databaseIds;
  }

  /** Every DataVault database this workflow reaches, by any of its routes. */
  private async collectReferencedDatabaseIds(workflowId: string): Promise<Set<string>> {
    const [fromDataSources, fromQueries, fromQueryTables, fromConfig] = await Promise.all([
      db.select({ id: workflowDataSources.dataSourceId })
        .from(workflowDataSources)
        .where(eq(workflowDataSources.workflowId, workflowId)),
      db.select({ id: workflowQueries.dataSourceId })
        .from(workflowQueries)
        .where(eq(workflowQueries.workflowId, workflowId)),
      // A query's tableId can belong to a different database than its
      // dataSourceId claims; take both so neither can dangle.
      db.select({ id: datavaultTables.databaseId })
        .from(workflowQueries)
        .innerJoin(datavaultTables, eq(workflowQueries.tableId, datavaultTables.id))
        .where(eq(workflowQueries.workflowId, workflowId)),
      this.collectConfigDatabaseIds(workflowId)
    ]);

    const ids = new Set<string>(fromConfig);
    for (const row of [...fromDataSources, ...fromQueries, ...fromQueryTables]) {
      if (row.id !== null) {
        ids.add(row.id);
      }
    }
    return ids;
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
        
        const written = await this.processRow(descriptor, row as Record<string, unknown>, state, ids);
        if (written) {
          totalRows++;
        }
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

  /**
   * A NOT NULL reference whose target did not make it into the bundle, or
   * `null` if every declared reference resolves.
   *
   * Reads `state.extractedIds`, so the referenced entity must appear earlier
   * in ENTITY_GRAPH than the referencing one. That holds for all four current
   * `dropIfUnresolved` entries; a descriptor added out of order would see an
   * absent set and drop every row, which the entity-graph ordering test
   * guards against.
   */
  private findUnresolvedRef(
    descriptor: EntityDescriptor,
    rowData: Record<string, unknown>,
    state: ExportState
  ): { column: string; entity: string; missingId: string } | null {
    for (const { column, entity } of descriptor.dropIfUnresolved ?? []) {
      const val = rowData[column];
      if (typeof val !== 'string' || val === '') {
        continue;
      }
      if (!state.extractedIds.get(entity)?.has(val)) {
        return { column, entity, missingId: val };
      }
    }
    return null;
  }

  /** @returns whether the row was written to the bundle. */
  private async processRow(
    descriptor: EntityDescriptor,
    rowData: Record<string, unknown>,
    state: ExportState,
    ids: Set<string>
  ): Promise<boolean> {
    const unresolved = this.findUnresolvedRef(descriptor, rowData, state);
    if (unresolved !== null) {
      state.warnings.push({
        type: 'dangling_reference',
        entity: descriptor.name,
        column: unresolved.column,
        missingId: unresolved.missingId,
        message:
          `A ${descriptor.name} row was omitted from the bundle: its ${unresolved.column} ` +
          `references a ${unresolved.entity} record that is outside this export. ` +
          `You will need to re-create that link after importing.`
      });
      return false;
    }

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
    return true;
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
    } else if (descriptor.name === 'templates' && root.scope === 'workflow') {
      // `templates.projectId` points at a project that is not in workflow
      // scope, so the parent branch below cannot serve this. Select exactly
      // the templates this workflow's versions reference -- never the
      // project's whole template library (IEX3-1).
      const templateIds = Array.from(state.workflowRefs.templateIds);
      if (templateIds.length === 0) {
        return null;
      }
      conditions.push(inArray(tableCols['id'], templateIds));
    } else if (descriptor.name === 'datavault_databases') {
      // datavault_databases has no FK parent; it attaches via (scopeType, scopeId).
      // A project export must also pick up databases scoped to that project's own
      // workflows or the workflow_queries that reference them
      // import as dangling. `workflows` is processed earlier in ENTITY_GRAPH, so
      // its ids are already extracted here.
      const ownScope = and(
        eq(tableCols['scopeType'], root.scope),
        eq(tableCols['scopeId'], root.id)
      );
      const workflowIds = root.scope === 'project'
        ? Array.from(state.extractedIds.get('workflows') ?? new Set<string>())
        : [];

      // A workflow root also pulls in the databases it actually references,
      // whatever their scope -- but only those the caller may export. Without
      // this, workflow_queries/workflow_data_sources (both NOT NULL) point at
      // databases outside the bundle and the import 400s (IEX3-1).
      const referenced = Array.from(state.workflowRefs.allowedDatabaseIds);

      const branches: Array<SQL<unknown> | undefined> = [ownScope];
      if (workflowIds.length > 0) {
        branches.push(and(
          eq(tableCols['scopeType'], 'workflow'),
          inArray(tableCols['scopeId'], workflowIds)
        ));
      }
      if (referenced.length > 0) {
        branches.push(inArray(tableCols['id'], referenced));
      }

      const present = branches.filter((b): b is SQL<unknown> => b !== undefined);
      const combined = present.length > 1 ? or(...present) : present[0];
      if (combined !== undefined) {
        conditions.push(combined);
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
