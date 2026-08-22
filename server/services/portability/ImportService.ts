import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID, createHash } from 'crypto';
import { z } from 'zod';
import { BundleReader } from './bundleReader';
import { ENTITY_GRAPH, EntityDescriptor } from './entityGraph';
import { ExportWarning, RequiresReentry, BundleManifest } from './bundleFormat';
import { runWithTenantContext, withCurrentTenant, withCurrentUserId, withTenant } from '../../utils/rlsContext';
import { projects, workflows, datavaultTables, steps, users, organizations } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { aclService } from '../AclService';
import { projectRepository, type DbTransaction } from '../../repositories';
import { canManageOrg } from '../../utils/ownershipAccess';
import { remapJsonIds } from '../../utils/remapJsonIds';
import { collectConfigEntityRefs } from '@shared/types/stepConfigRefs';
import { storageProvider } from '../storage';
import { storageQuotaService } from '../StorageQuotaService';
import { virusScanner } from '../security/VirusScanner';
import { logger } from '../../logger';

export type TargetOwner = {
  ownerType: 'user' | 'org';
  ownerUuid: string;
  tenantId: string;
};

export interface ImportApplyOptions {
  targetProjectId?: string;
  targetOwnerType?: 'user' | 'org';
  targetOwnerUuid?: string;
  name?: string;
}

export interface ImportPreview {
  canProceed: boolean;
  entityCounts: Record<string, number>;
  collisions: {
    entity: string;
    name: string;
    type: 'workflow' | 'project' | 'table_slug' | 'step_alias';
  }[];
  requiresReentry: RequiresReentry[];
  hasExecutableCode: boolean;
  warnings: ExportWarning[];
  errors: string[];
  migrationHead?: string | null;
}

/**
 * Entities whose `projectId` is re-pointed at the import target rather than
 * resolved through the bundle.
 *
 * A workflow-scope bundle carries no `projects` row, but both of these have a
 * `projectId` FK — `workflows.projectId` is nullable and may be unparented,
 * `templates.projectId` is NOT NULL and must land in a real project (IEX3-1).
 * Both are settled by `resolveProjectIdOverride`.
 */
const REPARENTED_PROJECT_ENTITIES = new Set(['workflows', 'templates']);

function isReparentedProjectRef(entityName: string, colName: string): boolean {
  return colName === 'projectId' && REPARENTED_PROJECT_ENTITIES.has(entityName);
}

interface ProcessEntityContext {
  tx: DbTransaction;
  desc: EntityDescriptor;
  reader: BundleReader;
  targetOwner: TargetOwner;
  userId: string;
  idMap: Map<string, string>;
  rootIds: string[];
  /** bundle-origin fileRef -> freshly written storage fileRef (IEX-10) */
  blobMap: Map<string, string>;
  /**
   * What to write into `workflows.projectId` when the bundle's own project is
   * not part of the bundle (IEX-15). `undefined` means leave it alone — either
   * the project came along and the refs remap already handled it, or the
   * original is legitimately the caller's.
   */
  projectIdOverride: string | null | undefined;
  /**
   * What the caller asked the imported root to be called, if anything.
   * See `applyRequestedName` — `applyOptionsSchema` has accepted this since
   * round 2 and nothing ever read it.
   */
  requestedName: string | undefined;
  warnings: ExportWarning[];
  /**
   * Bundle-origin ids of rows that were not inserted, so rows referencing them
   * can be skipped too rather than inserted against a FK that was never
   * written. Populated as the pass runs; correct only because ENTITY_GRAPH is
   * parent-before-child.
   */
  skippedOldIds: Set<string>;
}

export interface ImportApplyResult {
  rootId: string;
  scope: string;
  /** Tenant the bundle was written into — resolved server-side, never from the bundle. */
  tenantId: string;
  entityCounts: Record<string, number>;
  /** Blobs referenced by a row but absent from the bundle. Absent is not fatal. */
  warnings: ExportWarning[];
  /** Number of distinct objects written to storage. */
  blobsRestored: number;
  /**
   * Structural decisions taken server-side that the caller should surface —
   * currently only re-parenting of an imported workflow. Distinct from
   * `warnings`, which is the bundle-format union and must not grow new branches.
   */
  adjustments: string[];
}

/** Where a bundle fileRef was referenced from, for actionable rejection errors. */
interface BlobReference {
  entity: string;
  column: string;
}

export class ImportService {
  private extractManifestMetadata(manifest: BundleManifest, result: ImportPreview): void {
    result.migrationHead = manifest.migrationHead;
    if (manifest.requiresReentry !== undefined) {
      for (const entry of manifest.requiresReentry) {
        if (entry.type === 'secret' || entry.type === 'connection') {
          result.requiresReentry.push(entry);
        }
      }
    }
    if (manifest.warnings !== undefined) {
      for (const warn of manifest.warnings) {
        if (warn.type === 'missing_blob' || warn.type === 'secret_scan') {
          result.warnings.push(warn);
        }
      }
    }
  }

  private checkMigrationHead(bundleHead: string | null, warnings: ExportWarning[]): void {
    if (bundleHead === null) {
      return;
    }
    
    let entries: Array<{ tag: string }> = [];
    try {
      const journalPath = path.resolve(process.cwd(), 'migrations/meta/_journal.json');
      const content = fs.readFileSync(journalPath, 'utf8');
      const journal = JSON.parse(content) as Record<string, unknown>;
      if (Array.isArray(journal.entries)) {
        entries = journal.entries as Array<{ tag: string }>;
      }
    } catch (err) {
      // The journal is the only source for this comparison, so an unreadable
      // one means the drift guard silently does nothing -- precisely the
      // failure mode this check exists to prevent, and invisible from tests
      // because the repo tree always has migrations/. Say so out loud.
      logger.warn(
        { err, bundleHead },
        'Migration journal unreadable; skipping schema-drift check for this import'
      );
      return;
    }
    
    if (entries.length === 0) {
      return;
    }
    
    const systemHead = entries[entries.length - 1].tag;
    if (bundleHead === systemHead) {
      return;
    }
    
    const bundleIdx = entries.findIndex(e => e.tag === bundleHead);
    if (bundleIdx === -1) {
      throw new Error(`this bundle was created on a newer version of ezBuildr (migrationHead: ${bundleHead})`);
    } else {
      warnings.push({
        type: 'schema_drift',
        message: `This bundle was created on an older version of ezBuildr (migrationHead: ${bundleHead}). Import will proceed, but some fields may be mapped to defaults.`
      });
    }
  }

  private async getTargetOwnerForPreview(userId: string, targetProjectId?: string): Promise<TargetOwner | null> {
    // The caller's own row, read before any tenant is established — that read
    // is what establishes it. Self-identification clause (migration 0028).
    const user = await withCurrentUserId(userId, async (tx) => {
      const [row] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      return row;
    });
    if (user?.tenantId == null) {
      return null;
    }
    const tenantId = user.tenantId;

    if (targetProjectId !== undefined) {
      // `projects` is RLS-covered, and reading one outside the caller's tenant
      // must stay impossible — so the tenant just resolved above is pinned for
      // the read, and the ACL check shares the transaction rather than issuing
      // pool queries from inside it (the SystemStats deadlock shape).
      const { project, canView } = await withTenant(tenantId, async (tx) => {
        const [row] = await tx.select().from(projects).where(eq(projects.id, targetProjectId)).limit(1);
        if (row === undefined) {
          throw new Error('Project not found');
        }
        return { project: row, canView: await aclService.hasProjectRole(userId, targetProjectId, 'view', tx) };
      });
      if (!canView) {
        throw new Error('Access denied - insufficient permissions for this project');
      }
      return {
        ownerType: project.ownerType ?? 'user',
        ownerUuid: project.ownerUuid ?? project.ownerId ?? project.createdBy ?? project.creatorId ?? userId,
        tenantId: project.tenantId ?? tenantId
      };
    }
    return {
      ownerType: 'user',
      ownerUuid: userId,
      tenantId
    };
  }

  private async checkCollisions(
    targetOwner: TargetOwner,
    targetProjectId: string | undefined,
    extracted: { projects: Set<string>; workflows: Set<string>; tableSlugs: Set<string>; stepAliases: Set<string> },
    result: ImportPreview
  ): Promise<void> {
    if (extracted.projects.size > 0) {
      // projects / workflows / datavault_tables are all RLS-covered; each of
      // these three reads gets the target tenant pinned. They are separate
      // transactions rather than one because they are independent checks
      // guarded by different conditions — nothing here depends on them being
      // atomic.
      const existingProjects = await withTenant(targetOwner.tenantId, (tx) => tx.select({ name: projects.title })
        .from(projects)
        .where(and(
          eq(projects.ownerType, targetOwner.ownerType),
          eq(projects.ownerUuid, targetOwner.ownerUuid)
        )));
      const existingNames = new Set(existingProjects.map(p => p.name).filter(Boolean));
      for (const name of extracted.projects) {
        if (existingNames.has(name)) {
          result.collisions.push({ entity: 'projects', name, type: 'project' });
        }
      }
    }

    if (extracted.workflows.size > 0 && extracted.projects.size === 0) {
      const projectCondition = targetProjectId ? eq(workflows.projectId, targetProjectId) : isNull(workflows.projectId);
      const existingWorkflows = await withTenant(targetOwner.tenantId, (tx) => tx.select({ title: workflows.title })
        .from(workflows)
        .where(and(
          eq(workflows.ownerType, targetOwner.ownerType),
          eq(workflows.ownerUuid, targetOwner.ownerUuid),
          projectCondition
        )));
        
      const existingNames = new Set(existingWorkflows.map(w => w.title).filter(Boolean));
      for (const title of extracted.workflows) {
        if (existingNames.has(title)) {
          result.collisions.push({ entity: 'workflows', name: title, type: 'workflow' });
        }
      }
    }

    if (extracted.tableSlugs.size > 0) {
      const existingTables = await withTenant(targetOwner.tenantId, (tx) => tx.select({ slug: datavaultTables.slug })
        .from(datavaultTables)
        .where(eq(datavaultTables.tenantId, targetOwner.tenantId)));
      const existingSlugs = new Set(existingTables.map(t => t.slug).filter(Boolean));
      for (const slug of extracted.tableSlugs) {
        if (existingSlugs.has(slug)) {
          result.collisions.push({ entity: 'datavault_tables', name: slug, type: 'table_slug' });
        }
      }
    }
    
    // Step aliases check removed: checked during processEntityStream.
  }

  private shouldSkipEntity(desc: EntityDescriptor): boolean {
    return desc.importable === false;
  }

  private wrapDateField(schema: z.ZodTypeAny): z.ZodTypeAny {
    let isOptional = false;
    let isNullable = false;
    let current = schema;
    
    while (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      if (current instanceof z.ZodOptional) {
        isOptional = true;
        current = current.unwrap() as z.ZodTypeAny;
      } else if (current instanceof z.ZodNullable) {
        isNullable = true;
        current = current.unwrap() as z.ZodTypeAny;
      }
    }
    
    if (current instanceof z.ZodDate) {
      let newSchema: z.ZodTypeAny = z.coerce.date();
      if (isNullable) { newSchema = newSchema.nullable(); }
      if (isOptional) { newSchema = newSchema.optional(); }
      return newSchema;
    }
    
    return schema;
  }

  private getZodSchema(desc: EntityDescriptor): z.ZodTypeAny {
    const rawSchema = createInsertSchema(desc.table);
    let shape: Record<string, z.ZodTypeAny> = {};
    if (rawSchema instanceof z.ZodObject) {
      shape = rawSchema.shape;
    }
    
    const pickedShape: Record<string, z.ZodTypeAny> = {};
    for (const f of desc.fields) {
      if (f in shape) {
        // A descriptor override wins over the column's drizzle-zod schema, for
        // jsonb columns whose contents carry meaning the column type cannot
        // express (`workflows.settings`, BIZ-2). Applies to preview and apply
        // alike, because both parse through here.
        pickedShape[f] = desc.fieldSchemas?.[f] ?? this.wrapDateField(shape[f]);
      }
    }
    return z.object(pickedShape).strip();
  }

  private handleDanglingReference(options: {
    mode: 'preview' | 'apply';
    desc: EntityDescriptor;
    colName: string;
    val: string;
    previewResult?: ImportPreview;
    applyCtx?: ProcessEntityContext;
    data?: Record<string, unknown>;
  }): void {
    const { mode, desc, colName, val, previewResult, applyCtx, data } = options;
    const tableColumns = desc.table as unknown as Record<string, { notNull?: boolean }>;
    const isNotNull = tableColumns[colName]?.notNull === true;

    if (isNotNull) {
      if (mode === 'preview' && previewResult) {
        previewResult.errors.push(`Validation failed in ${desc.name}: Unresolvable reference: ${desc.name}.${colName} -> ${val}`);
        previewResult.canProceed = false;
      } else {
        throw new Error(`Unresolvable reference: ${desc.name}.${colName} -> ${val}`);
      }
    } else {
      const warning: ExportWarning = {
        type: 'dangling_reference',
        entity: desc.name,
        column: colName,
        missingId: val,
        message: `Dangling reference dropped: ${desc.name}.${colName} -> ${val}`
      };
      if (mode === 'preview' && previewResult) {
        previewResult.warnings.push(warning);
      } else if (mode === 'apply' && applyCtx && data) {
        data[colName] = null;
        applyCtx.warnings.push(warning);
      }
    }
  }

  /**
   * Warn about ids inside a jsonb config that point at entities the bundle
   * does not contain (IEX3-2).
   *
   * `resolved` is the set of source ids the import can map — the bundle's own
   * ids during preview, `idMap`'s keys during apply. **Must be called before
   * `remapJsonIds` rewrites the column**, or every successfully remapped ref
   * would look unresolvable: after the remap the value is the *new* id, which
   * is never a key of either set.
   *
   * These are warnings, never errors. A workflow whose dropdown lost its
   * binding is still a usable baseline; the user just has to be told, which is
   * the whole point. The values are left in place so they can see what the
   * binding was when they rewire it.
   */
  private collectConfigRefWarnings(
    desc: EntityDescriptor,
    data: Record<string, unknown>,
    resolved: { has(id: string): boolean }
  ): ExportWarning[] {
    const warnings: ExportWarning[] = [];
    for (const column of desc.entityRefColumns ?? []) {
      const value = data[column];
      if (value == null) {
        continue;
      }
      for (const ref of collectConfigEntityRefs(value, column)) {
        if (resolved.has(ref.id)) {
          continue;
        }
        warnings.push({
          type: 'dangling_reference',
          entity: desc.name,
          column: ref.path,
          missingId: ref.id,
          message:
            `${desc.name}.${ref.path} points at a ${ref.entity} record that is not in this bundle. ` +
            `The reference was left as-is and will not resolve here — re-point it after importing.`
        });
      }
    }
    return warnings;
  }

  private checkDanglingReferences(desc: EntityDescriptor, data: Record<string, unknown>, bundleIds: Set<string>, result: ImportPreview): void {
    for (const colName of desc.refs ?? []) {
      const val = data[colName];
      if (typeof val === 'string' && val !== '' && !bundleIds.has(val)) {
        if (isReparentedProjectRef(desc.name, colName)) {
          // These projectIds are allowed to pass through if they point at the
          // caller's own project (same-system re-import). resolveProjectIdOverride
          // decides during apply.
          continue; // Handled by resolveProjectIdOverride during apply
        }
        this.handleDanglingReference({ mode: 'preview', desc, colName, val, previewResult: result });
      }
    }
  }

  private remapForeignKeys(ctx: ProcessEntityContext, data: Record<string, unknown>): void {
    for (const colName of ctx.desc.refs ?? []) {
      const val = data[colName];
      if (typeof val === 'string' && val !== '') {
        if (ctx.idMap.has(val)) {
          data[colName] = ctx.idMap.get(val)!;
        } else {
          if (isReparentedProjectRef(ctx.desc.name, colName)) {
            continue; // Handled by resolveProjectIdOverride below
          }
          this.handleDanglingReference({ mode: 'apply', desc: ctx.desc, colName, val, applyCtx: ctx, data });
        }
      }
    }
  }

  private async processEntityStream(
    reader: BundleReader,
    desc: EntityDescriptor,
    extracted: { projects: Set<string>; workflows: Set<string>; tableSlugs: Set<string>; stepAliases: Set<string> },
    result: ImportPreview,
    bundleIds: Set<string>
  ): Promise<void> {
    let count = 0;
    const schema = this.getZodSchema(desc);
    const stream = reader.readEntityStream(desc.name);
    
    for await (const row of stream) {
      const parsed = schema.safeParse(row);
      if (!parsed.success) {
        result.errors.push(`Validation failed in ${desc.name}: ${parsed.error.message}`);
        result.canProceed = false;
        continue;
      }

      if (['transform_blocks', 'lifecycle_hooks', 'document_hooks'].includes(desc.name)) {
        result.hasExecutableCode = true;
      }

      const data = parsed.data as Record<string, unknown>;
      if (desc.name === 'workflows' && typeof data['title'] === 'string' && data['title'] !== '') {
        extracted.workflows.add(data['title']);
      }
      if (desc.name === 'projects' && typeof data['name'] === 'string' && data['name'] !== '') {
        extracted.projects.add(data['name']);
      }
      if (desc.name === 'datavault_tables' && typeof data['slug'] === 'string' && data['slug'] !== '') {
        extracted.tableSlugs.add(data['slug']);
      }
      if (desc.name === 'steps' && typeof data['alias'] === 'string' && data['alias'] !== '' && typeof data['workflowId'] === 'string' && data['workflowId'] !== '') {
        const scopeKey = `${data['workflowId']}::${data['alias']}`;
        if (extracted.stepAliases.has(scopeKey)) {
          result.collisions.push({ entity: 'steps', name: data['alias'], type: 'step_alias' });
        } else {
          extracted.stepAliases.add(scopeKey);
        }
      }

      this.checkDanglingReferences(desc, data, bundleIds, result);
      result.warnings.push(...this.collectConfigRefWarnings(desc, data, bundleIds));

      count++;
    }
    
    if (count > 0) {
      result.entityCounts[desc.name] = count;
    }
  }

  /**
   * `filePath` is the caller's own file (the multer upload in production, a
   * spooled temp file in tests) — read directly, never copied (IEX2-10).
   * Cleanup of `filePath` itself is the caller's responsibility.
   */
  async preview(filePath: string, userId: string, targetProjectId?: string): Promise<ImportPreview> {
    const targetOwner = await this.getTargetOwnerForPreview(userId, targetProjectId);
    const result: ImportPreview = {
      canProceed: true,
      entityCounts: {},
      collisions: [],
      requiresReentry: [],
      hasExecutableCode: false,
      warnings: [],
      errors: []
    };
    
    let reader: BundleReader | null = null;
    try {
      reader = new BundleReader(filePath);
      await reader.open();

      const extracted = {
        projects: new Set<string>(),
        workflows: new Set<string>(),
        tableSlugs: new Set<string>(),
        stepAliases: new Set<string>()
      };

      const bundleIds = new Set<string>();
      for (const desc of ENTITY_GRAPH) {
        if (this.shouldSkipEntity(desc)) {continue;}
        const stream = reader.readEntityStream(desc.name);
        for await (const row of stream) {
          if (row && typeof row === 'object' && typeof (row as Record<string, unknown>)['id'] === 'string') {
            bundleIds.add((row as Record<string, unknown>)['id'] as string);
          }
        }
      }

      for (const desc of ENTITY_GRAPH) {
        if (this.shouldSkipEntity(desc)) {continue;}
        await this.processEntityStream(reader, desc, extracted, result, bundleIds);
      }
      this.extractManifestMetadata(reader.manifest, result);
      this.checkMigrationHead(reader.manifest.migrationHead, result.warnings);

      if (targetOwner !== null) {
        await this.checkCollisions(targetOwner, targetProjectId, extracted, result);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (
          err.name === 'BundleSizeLimitError' ||
          err.message.includes('overflow') ||
          err.message.includes('traversal') ||
          err.message.includes('Format version') ||
          err.message.includes('Missing manifest') ||
          err.message.includes('Checksum mismatch')
        ) {
          throw err;
        }
        result.errors.push(`Failed to parse bundle: ${err.message}`);
      } else {
        result.errors.push('Failed to parse bundle with unknown error');
      }
      result.canProceed = false;
    } finally {
      reader?.close();
    }

    return result;
  }
  
  private async resolveTargetOwnerForProject(userId: string, tenantId: string, targetProjectId: string): Promise<TargetOwner> {
    // RLS-5: the caller's tenant IS known by now (resolveTargetOwner resolved
    // it just above), so this is ordinary tenant-scoped work rather than a
    // bootstrap — pin the real tenant instead of reaching for 0033's
    // project-id clause, which exists for the case where no tenant is known.
    // Reading a project outside the caller's tenant must stay impossible here.
    const project = await runWithTenantContext(tenantId, () =>
      withCurrentTenant((tx) => projectRepository.findById(targetProjectId, tx)));
    if (project === undefined) { throw new Error('Target project not found'); }

    const hasProjectEdit = await withCurrentTenant((aclTx) => aclService.hasProjectRole(userId, targetProjectId, 'edit', aclTx));
    if (!hasProjectEdit) { throw new Error('Access denied - insufficient permissions for target project'); }

    if (project.ownerType === 'org' && project.ownerUuid !== null && !(await canManageOrg(userId, project.ownerUuid))) {
      throw new Error('Access denied: Organization admin role required to copy into this organization project');
    }

    return {
      ownerType: project.ownerType ?? 'user',
      ownerUuid: project.ownerUuid ?? project.ownerId ?? project.createdBy ?? project.creatorId ?? userId,
      tenantId: project.tenantId ?? tenantId,
    };
  }

  private async resolveTargetOwner(userId: string, options: ImportApplyOptions): Promise<TargetOwner> {
    // RLS-5: pure bootstrap — this read exists to DISCOVER the tenant, so
    // there is none to pin yet. `users`' self-identification clause
    // (migration 0028) is what makes the caller's own row visible; without
    // this the import fails as "User not found or missing tenant" for every
    // user who has a tenant, which is all of them.
    const [user] = await withCurrentUserId(userId, (tx) =>
      tx.select().from(users).where(eq(users.id, userId)).limit(1));
    const tenantId = user?.tenantId;
    if (tenantId === undefined || tenantId === null) {
      throw new Error('User not found or missing tenant');
    }

    if (options.targetProjectId !== undefined) {
      return this.resolveTargetOwnerForProject(userId, tenantId, options.targetProjectId);
    }

    const ownerType = options.targetOwnerType ?? 'user';
    const ownerUuid = options.targetOwnerUuid ?? userId;

    if (ownerType === 'user' && ownerUuid !== userId) {
      throw new Error('Access denied - cannot copy to another user');
    }

    if (ownerType === 'org') {
      // `organizations` is RLS-covered. The tenant is already known here, so
      // this is ordinary scoped work — 0033's org-id bootstrap clause is for
      // the case where it is not.
      const org = await withTenant(tenantId, async (tx) => {
        const [row] = await tx.select().from(organizations).where(eq(organizations.id, ownerUuid)).limit(1);
        return row;
      });
      if (org === undefined) { throw new Error('Target organization not found'); }
      if (org.tenantId !== tenantId) { throw new Error('Access denied - target organization belongs to different tenant'); }
      
      const canManageTargetOrg = await canManageOrg(userId, ownerUuid);
      if (!canManageTargetOrg) { throw new Error('Access denied: Organization admin role required to copy into this organization'); }
    }

    return { ownerType, ownerUuid, tenantId };
  }

  private slugify(value: string): string {
    const slug = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'copy';
  }

  private async ensureUniqueProjectTitle(tx: DbTransaction, ownerType: string, ownerUuid: string, requestedTitle: string): Promise<string> {
    let candidate = requestedTitle.substring(0, 255);
    let counter = 2;
    let isUnique = false;
    while (!isUnique) {
      const res = await tx.select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.ownerType, ownerType as 'user' | 'org'), eq(projects.ownerUuid, ownerUuid), eq(projects.title, candidate)))
        .limit(1);
      if (res.length === 0) {
        isUnique = true;
      } else {
        const suffix = ` (${counter})`;
        candidate = `${requestedTitle.substring(0, 255 - suffix.length)}${suffix}`;
        counter++;
      }
    }
    return candidate;
  }

  private async ensureUniqueWorkflowTitle(tx: DbTransaction, ownerType: string, ownerUuid: string, projectId: string | null, requestedTitle: string): Promise<string> {
    let candidate = requestedTitle.substring(0, 255);
    let counter = 2;
    let isUnique = false;
    const projectCondition = projectId === null ? isNull(workflows.projectId) : eq(workflows.projectId, projectId);
    while (!isUnique) {
      const res = await tx.select({ id: workflows.id })
        .from(workflows)
        .where(and(eq(workflows.ownerType, ownerType as 'user' | 'org'), eq(workflows.ownerUuid, ownerUuid), projectCondition, eq(workflows.title, candidate)))
        .limit(1);
      if (res.length === 0) {
        isUnique = true;
      } else {
        const suffix = ` (${counter})`;
        candidate = `${requestedTitle.substring(0, 255 - suffix.length)}${suffix}`;
        counter++;
      }
    }
    return candidate;
  }

  private async ensureUniqueTableSlug(tx: DbTransaction, tenantId: string, requestedSlug: string): Promise<string> {
    let candidate = requestedSlug.substring(0, 255);
    let counter = 2;
    let isUnique = false;
    while (!isUnique) {
      const res = await tx.select({ id: datavaultTables.id })
        .from(datavaultTables)
        .where(and(eq(datavaultTables.tenantId, tenantId), eq(datavaultTables.slug, candidate)))
        .limit(1);
      if (res.length === 0) {
        isUnique = true;
      } else {
        const suffix = `-${counter}`;
        candidate = `${requestedSlug.substring(0, 255 - suffix.length)}${suffix}`;
        counter++;
      }
    }
    return candidate;
  }

  private async ensureUniqueStepAlias(tx: DbTransaction, workflowId: string, requestedAlias: string): Promise<string> {
    let candidate = requestedAlias.substring(0, 255);
    let counter = 2;
    let isUnique = false;
    while (!isUnique) {
      const res = await tx.select({ id: steps.id })
        .from(steps)
        .where(and(eq(steps.workflowId, workflowId), eq(steps.alias, candidate)))
        .limit(1);
      if (res.length === 0) {
        isUnique = true;
      } else {
        const suffix = `_${counter}`;
        candidate = `${requestedAlias.substring(0, 255 - suffix.length)}${suffix}`;
        counter++;
      }
    }
    return candidate;
  }

  private enforceOwnership(desc: EntityDescriptor, data: Record<string, unknown>, targetOwner: TargetOwner, userId: string): void {
    const rawSchema = createInsertSchema(desc.table);
    let shape: Record<string, z.ZodTypeAny> = {};
    if (rawSchema instanceof z.ZodObject) {
      shape = rawSchema.shape;
    }
    
    if ('tenantId' in shape) { data['tenantId'] = targetOwner.tenantId; }
    if ('ownerType' in shape) { data['ownerType'] = targetOwner.ownerType; }
    if ('ownerUuid' in shape) { data['ownerUuid'] = targetOwner.ownerUuid; }
    if ('ownerId' in shape) { data['ownerId'] = userId; }
    if ('creatorId' in shape) { data['creatorId'] = userId; }
    if ('createdBy' in shape) { data['createdBy'] = userId; }
    if ('updatedBy' in shape) { data['updatedBy'] = userId; }
    if ('lastModifiedBy' in shape) { data['lastModifiedBy'] = userId; }
    if ('ownerUserId' in shape) { data['ownerUserId'] = userId; }

    // Publication state is stamped locally and never inherited.
    // A live publicLink shared across tenants exposes data to the wrong client,
    // an imported slug guarantees a unique-index violation preventing import,
    // and versions must not bypass this system's publish gate by arriving pre-published.
    // We force workflows back to draft and versions to unpublished.
    if (desc.name === 'workflows') {
      data['isPublic'] = false;
      data['publicLink'] = null;
      data['slug'] = null;
      data['status'] = 'draft';
    }
    if (desc.name === 'workflow_versions') {
      data['published'] = false;
      data['publishedAt'] = null;
    }
  }

  /**
   * Rename the imported root, when the caller asked for one.
   *
   * `applyOptionsSchema` has allowed `name` since round 2 and `apply` never
   * read it, so the import screen's "Rename" field sent a value the service
   * discarded and the user got the original title back (IEX3-8).
   *
   * Root row only. A project bundle carries many workflows; renaming all of
   * them to one title is not what "rename this import" means. Runs before
   * `enforceNameUniqueness`, so a requested name that already exists still
   * gets the same `(2)` treatment as an inherited one.
   */
  private applyRequestedName(
    ctx: ProcessEntityContext,
    data: Record<string, unknown>,
    oldId: string | undefined
  ): void {
    if (ctx.requestedName === undefined || oldId === undefined || !ctx.rootIds.includes(oldId)) {
      return;
    }
    // Written by key presence rather than by entity name: `data` is already
    // narrowed to the descriptor's field allowlist, so this reaches whichever
    // of title/name that root actually has.
    if ('title' in data) { data['title'] = ctx.requestedName; }
    if ('name' in data) { data['name'] = ctx.requestedName; }
  }

  private async enforceNameUniqueness(ctx: ProcessEntityContext, data: Record<string, unknown>): Promise<void> {
    if (ctx.desc.name === 'projects' && data['name']) {
      data['title'] = await this.ensureUniqueProjectTitle(ctx.tx, ctx.targetOwner.ownerType, ctx.targetOwner.ownerUuid, (data['title'] as string) ?? (data['name'] as string));
      data['name'] = data['title'];
    }
    if (ctx.desc.name === 'workflows' && data['title']) {
      data['title'] = await this.ensureUniqueWorkflowTitle(ctx.tx, ctx.targetOwner.ownerType, ctx.targetOwner.ownerUuid, (data['projectId'] as string) ?? null, data['title'] as string);
      data['name'] = data['title'];
    }
    if (ctx.desc.name === 'datavault_tables' && data['slug']) {
      data['slug'] = await this.ensureUniqueTableSlug(ctx.tx, ctx.targetOwner.tenantId, this.slugify((data['slug'] as string) ?? (data['name'] as string)));
    }
    if (ctx.desc.name === 'steps' && data['alias'] && data['workflowId']) {
      data['alias'] = await this.ensureUniqueStepAlias(ctx.tx, data['workflowId'] as string, data['alias'] as string);
    }
  }

  /**
   * Map every bundle fileRef back to the entity/column that referenced it, so a
   * rejected blob can name where it came from rather than just its hash.
   */
  private async collectBlobReferences(reader: BundleReader): Promise<Map<string, BlobReference>> {
    const references = new Map<string, BlobReference>();
    for (const desc of ENTITY_GRAPH) {
      if (desc.blobRefs === undefined || desc.blobRefs.length === 0) {continue;}
      if (this.shouldSkipEntity(desc)) {continue;}

      const schema = this.getZodSchema(desc);
      for await (const rawRow of reader.readEntityStream(desc.name)) {
        const parsed = schema.safeParse(rawRow);
        if (!parsed.success) {continue;}
        const data = parsed.data as Record<string, unknown>;
        for (const col of desc.blobRefs) {
          const value = data[col];
          if (typeof value === 'string' && value !== '' && !references.has(value)) {
            references.set(value, { entity: desc.name, column: col });
          }
        }
      }
    }
    return references;
  }

  private describeRef(references: Map<string, BlobReference>, fileRef: string): string {
    const ref = references.get(fileRef);
    return ref === undefined ? `fileRef ${fileRef}` : `${ref.entity}.${ref.column} (fileRef ${fileRef})`;
  }

  /**
   * Restore bundle blobs into storage. Gate order is deliberate and asserted by
   * IEX-10's tests: quota, then integrity, then scan, then write — every blob
   * clears every gate before a single byte is written, so a rejected import
   * leaves storage untouched rather than half-populated.
   */
  private async restoreBlobs(
    reader: BundleReader,
    tenantId: string,
    warnings: ExportWarning[]
  ): Promise<Map<string, string>> {
    const mapping = new Map<string, string>();
    const index = await reader.readBlobIndex();
    const references = await this.collectBlobReferences(reader);

    // Referenced but not carried: import the row with the ref unset. Absent is
    // not malicious and must not abort (IEX-5 wrote the matching export warning).
    for (const [fileRef, ref] of references) {
      if (index[fileRef] === undefined) {
        warnings.push({
          type: 'missing_blob',
          entity: ref.entity,
          column: ref.column,
          fileRef,
          message: `Blob not present in bundle: ${fileRef}. Imported row will have no file attached.`
        });
      }
    }

    const entries = Object.entries(index);
    if (entries.length === 0) {
      return mapping;
    }

    // Gate 1 — quota, before anything is read, scanned or written.
    const totalBytes = entries.reduce((sum, [, meta]) => sum + meta.size, 0);
    await storageQuotaService.checkQuota(tenantId, totalBytes);

    // Gates 2 and 3 verify+scan one blob at a time and spool each survivor to
    // disk instead of holding it in a Map — peak heap is one blob, not the
    // bundle's total blob size (IEX2-10). The spool dir is what lets "every
    // gate before any write" survive without keeping every buffer in memory.
    const spoolDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ezb-blobs-'));
    try {
      const verifiedShas = new Set<string>();
      for (const [fileRef, meta] of entries) {
        if (verifiedShas.has(meta.sha256)) {continue;}

        const buffer = await reader.readBlob(meta.sha256);
        const actual = createHash('sha256').update(buffer).digest('hex');
        if (actual !== meta.sha256) {
          throw new Error(
            `Bundle integrity check failed: blob content does not match its sha256 ` +
            `(expected ${meta.sha256}, got ${actual}), referenced by ${this.describeRef(references, fileRef)}`
          );
        }

        const scan = await virusScanner().scan(buffer, meta.filename);
        if (!scan.safe) {
          throw new Error(
            `Import rejected: potential malware detected (${String(scan.threatName)}) ` +
            `in blob referenced by ${this.describeRef(references, fileRef)}`
          );
        }

        await fs.promises.writeFile(path.join(spoolDir, meta.sha256), buffer);
        verifiedShas.add(meta.sha256);
      }

      // Gate 4 — every blob passed; now write. One stored object per unique
      // hash, read off the spool disk one at a time rather than from memory.
      const written = new Map<string, string>();
      for (const [fileRef, meta] of entries) {
        let newRef = written.get(meta.sha256);
        if (newRef === undefined) {
          if (!verifiedShas.has(meta.sha256)) {continue;}
          const buffer = await fs.promises.readFile(path.join(spoolDir, meta.sha256));
          newRef = await storageProvider.saveFile(buffer, meta.filename, meta.mimeType);
          written.set(meta.sha256, newRef);
        }
        mapping.set(fileRef, newRef);
      }

      return mapping;
    } finally {
      await fs.promises.rm(spoolDir, { recursive: true, force: true });
    }
  }

  /**
   * Decide what `workflows.projectId` should be for rows whose project is not
   * carried by the bundle (IEX-15).
   *
   * A workflow-scope bundle contains `workflows` but not `projects` — projects
   * sit above the root — so the bundle's `projectId` is a foreign id. Left
   * alone it either dangles (different system) or silently re-attaches the
   * import to the SOURCE project (same system), which is what made an imported
   * workflow collide with its own source title.
   *
   * Runs before the transaction opens: it issues pool queries, and those
   * deadlock the size-1 test pool if run inside a caller's transaction.
   */
  private async resolveProjectIdOverride(params: {
    bundleProjectIds: Set<string>;
    idMap: Map<string, string>;
    userId: string;
    targetOwner: TargetOwner;
    options: ImportApplyOptions;
    adjustments: string[];
  }): Promise<string | null | undefined> {
    const { bundleProjectIds, idMap, userId, targetOwner, options, adjustments } = params;
    const unmapped = [...bundleProjectIds].filter(id => !idMap.has(id));
    if (unmapped.length === 0) {
      return undefined; // project travelled with the bundle; the refs remap owns it
    }

    if (options.targetProjectId !== undefined) {
      // resolveTargetOwnerForProject already proved 'edit' on this project.
      return options.targetProjectId;
    }

    // No explicit target. Keeping the bundle's own project is only acceptable
    // when it really is the caller's to write to — same tenant, edit rights.
    for (const projectId of unmapped) {
      const project = await withTenant(targetOwner.tenantId, (tx) =>
        projectRepository.findById(projectId, tx));
      const sameTenant = project !== undefined && project.tenantId === targetOwner.tenantId;
      const canEdit = sameTenant && await withCurrentTenant((aclTx) => aclService.hasProjectRole(userId, projectId, 'edit', aclTx));
      if (!canEdit) {
        adjustments.push(
          `Imported workflow was left without a project: the bundle referenced project ${projectId}, ` +
          `which is not yours in this tenant. Re-import with targetProjectId to place it.`
        );
        return null;
      }
    }

    return undefined;
  }

  /**
   * Why this row cannot be written, or `null` if it can.
   *
   * Two cases, both created by workflow-scope bundles that carry templates
   * (IEX3-1): a template that has nowhere to live because the import could not
   * resolve a target project, and any row whose parent was skipped for that
   * reason. Inserting the latter would violate a FK that was never written.
   */
  private findSkipReason(ctx: ProcessEntityContext, data: Record<string, unknown>): string | null {
    if (ctx.desc.name === 'templates' && ctx.projectIdOverride === null) {
      return 'the import could not resolve a project to place it in';
    }
    for (const colName of ctx.desc.refs ?? []) {
      const val = data[colName];
      if (typeof val === 'string' && ctx.skippedOldIds.has(val)) {
        return `the ${colName} it belongs to was not imported`;
      }
    }
    return null;
  }

  /**
   * @returns `rootId` when this row was one of the bundle roots, and whether
   * the row was written at all.
   */
  private async processSingleEntity(
    ctx: ProcessEntityContext,
    data: Record<string, unknown>,
    oldId: string | undefined
  ): Promise<{ rootId: string | null; skipped: boolean }> {
    const skipReason = this.findSkipReason(ctx, data);
    if (skipReason !== null) {
      if (oldId !== undefined) {
        ctx.skippedOldIds.add(oldId);
      }
      ctx.warnings.push({
        type: 'dangling_reference',
        entity: ctx.desc.name,
        column: 'projectId',
        missingId: oldId ?? '',
        message:
          `A ${ctx.desc.name} row was not imported because ${skipReason}. ` +
          `Re-import with a target project to bring it across.`
      });
      return { rootId: null, skipped: true };
    }

    // Role-bearing entities are dropped wholesale by shouldSkipEntity(), and any
    // other entity's `role`/`tenantRole` is stripped by the desc.fields allowlist
    // in getZodSchema(), so no per-row role scrubbing is needed here.

    // Before the remap, while the config still holds source ids: report the
    // embedded references this import cannot resolve (IEX3-2).
    ctx.warnings.push(...this.collectConfigRefWarnings(ctx.desc, data, ctx.idMap));

    // Remap IDs in JSON fields
    for (const jsonRef of (ctx.desc.jsonRefs ?? [])) {
      if (data[jsonRef]) {
        data[jsonRef] = remapJsonIds(data[jsonRef], ctx.idMap);
      }
    }
    
    // Remap explicit foreign keys from the descriptor's declared ref columns.
    // UUIDs are globally unique, so a single idMap covers every entity.
    this.remapForeignKeys(ctx, data);
    
    // Repoint blob columns at the freshly written objects. A ref we could not
    // restore is cleared to the empty sentinel rather than carried over: both
    // blobRefs columns in the graph (templates.fileRef, template_versions.fileRef)
    // are NOT NULL, so "unset" cannot be null. Carrying the bundle's own ref
    // through would be worse than either — on a same-system import it resolves
    // to the SOURCE tenant's object in shared storage, handing the importing
    // tenant a file that is not theirs. Empty fails closed on download instead.
    // Same reasoning, for material the export withheld on purpose: the column
    // is NOT NULL, the bundle correctly does not carry it, so the row cannot
    // be written without a placeholder. requiresReentry already names these
    // for the user (IEX3-7).
    for (const col of ctx.desc.withheldColumns ?? []) {
      data[col] = '';
    }

    for (const col of ctx.desc.blobRefs ?? []) {
      const value = data[col];
      if (typeof value === 'string' && value !== '') {
        data[col] = ctx.blobMap.get(value) ?? '';
      }
    }

    // Re-parent an imported workflow (or its templates) whose project did not
    // travel with it. Decided once, before the transaction, by
    // resolveProjectIdOverride.
    if (isReparentedProjectRef(ctx.desc.name, 'projectId') && ctx.projectIdOverride !== undefined) {
      data['projectId'] = ctx.projectIdOverride;
    }

    this.enforceOwnership(ctx.desc, data, ctx.targetOwner, ctx.userId);
    
    // Assign new ID from Pass 1 mapping
    let newId = randomUUID();
    if (oldId !== undefined) {
      if (ctx.idMap.has(oldId)) {
        newId = ctx.idMap.get(oldId)! as ReturnType<typeof randomUUID>;
      } else {
        ctx.idMap.set(oldId, newId);
      }
      data['id'] = newId;
    }
    
    this.applyRequestedName(ctx, data, oldId);
    await this.enforceNameUniqueness(ctx, data);
    await ctx.tx.insert(ctx.desc.table).values(data as never);
    
    if (oldId !== undefined && ctx.rootIds.includes(oldId)) {
      return { rootId: newId, skipped: false };
    }
    return { rootId: null, skipped: false };
  }

  private async processEntityInsertion(ctx: ProcessEntityContext): Promise<{ rootId: string; count: number }> {
    let newRootId = '';
    let count = 0;
    const schemaObj = this.getZodSchema(ctx.desc);
    const stream = ctx.reader.readEntityStream(ctx.desc.name);
    
    for await (const rawRow of stream) {
      const parsed = schemaObj.safeParse(rawRow);
      if (!parsed.success) {
        throw new Error(`Validation failed in ${ctx.desc.name}: ${parsed.error.message}`);
      }
      
      const data = parsed.data as Record<string, unknown>;
      const oldId = typeof data['id'] === 'string' ? data['id'] : undefined;
      
      const { rootId, skipped } = await this.processSingleEntity(ctx, data, oldId);
      if (skipped) {
        continue;
      }
      if (rootId !== null) {
        newRootId = rootId;
      }
      count++;
    }
    return { rootId: newRootId, count };
  }

  private async allocateIds(reader: BundleReader, idMap: Map<string, string>): Promise<Set<string>> {
    const bundleProjectIds = new Set<string>();
    for (const desc of ENTITY_GRAPH) {
      if (this.shouldSkipEntity(desc)) {continue;}
      const schemaObj = this.getZodSchema(desc);
      const stream = reader.readEntityStream(desc.name);
      for await (const rawRow of stream) {
         const parsed = schemaObj.safeParse(rawRow);
         if (parsed.success) {
           const data = parsed.data as Record<string, unknown>;
           if (typeof data['id'] === 'string') {
             idMap.set(data['id'], randomUUID());
           }
           if (desc.name === 'workflows' && typeof data['projectId'] === 'string') {
             bundleProjectIds.add(data['projectId']);
           }
         }
      }
    }
    return bundleProjectIds;
  }

  /**
   * `filePath` is the caller's own file (the multer upload in production, a
   * spooled temp file in tests) — read directly, never copied (IEX2-10).
   * Cleanup of `filePath` itself is the caller's responsibility.
   */
  async apply(filePath: string, userId: string, options: ImportApplyOptions = {}): Promise<ImportApplyResult> {
    const targetOwner = await this.resolveTargetOwner(userId, options);

    // A blank rename is no rename; treat it as absent rather than writing an
    // empty title that then fails the uniqueness loop's `substring` on nothing.
    const trimmedName = options.name?.trim();
    const requestedName = trimmedName === undefined || trimmedName === '' ? undefined : trimmedName;

    let reader: BundleReader | null = null;
    let newRootId = '';
    const warnings: ExportWarning[] = [];
    const adjustments: string[] = [];

    try {
      reader = new BundleReader(filePath);
      await reader.open();
      const manifest = reader.manifest;

      this.checkMigrationHead(manifest.migrationHead, warnings);

      const idMap = new Map<string, string>();
      const rootIds = manifest.rootIds;

      // Blob restore runs before the transaction: every quota/integrity/scan
      // gate must reject the import before any row is created.
      const blobMap = await this.restoreBlobs(reader, targetOwner.tenantId, warnings);

      try {
        // Pass 1: Allocate new UUIDs for every row across all entities
        // This allows forward references (like currentVersionId) to be remapped
        // correctly during insertion in Pass 2.
        const bundleProjectIds = await this.allocateIds(reader, idMap);

        const projectIdOverride = await this.resolveProjectIdOverride({
          bundleProjectIds, idMap, userId, targetOwner, options, adjustments
        });

        const observedEntityCounts: Record<string, number> = {};
        const skippedOldIds = new Set<string>();

        // Pass 2: Remap foreign keys and insert rows.
        // RLS-5: every row written here carries `targetOwner.tenantId` (see
        // `applyFieldDefaults`, which stamps it onto any entity whose shape has
        // a tenantId). A raw `db.transaction` sets no GUC, so the policy reads
        // `tenant_id IS NOT DISTINCT FROM NULL` and WITH CHECK rejects the very
        // rows the import exists to create. Pin the tenant the import is
        // targeting — the same value the rows are stamped with, so WITH CHECK
        // can only ever accept rows belonging to it and an import cannot write
        // into a tenant it did not resolve.
        await withTenant(targetOwner.tenantId, async (tx: DbTransaction) => {
          for (const desc of ENTITY_GRAPH) {
            if (this.shouldSkipEntity(desc)) {continue;}
            
            const result = await this.processEntityInsertion({
              tx,
              desc,
              reader: reader as BundleReader,
              targetOwner,
              userId,
              idMap,
              rootIds,
              blobMap,
              projectIdOverride,
              requestedName,
              warnings,
              skippedOldIds
            });
            if (result.rootId) {
              newRootId = result.rootId;
            }
            if (result.count > 0) {
              observedEntityCounts[desc.name] = result.count;
            }
          }

          // Must stay inside the transaction: throwing after it commits would
          // reject the import with a 400 while leaving every inserted row
          // behind, unreachable because no rootId was ever resolved.
          if (newRootId === '') {
            throw new Error('Bundle roots not found in bundle data');
          }
        });

        return {
          rootId: newRootId,
          scope: manifest.scope,
          tenantId: targetOwner.tenantId,
          entityCounts: observedEntityCounts,
          warnings,
          blobsRestored: new Set(blobMap.values()).size,
          adjustments
        };
      } catch (error) {
        if (blobMap.size > 0) {
          const writtenRefs = new Set(blobMap.values());
          for (const ref of writtenRefs) {
            try {
              await storageProvider.deleteFile(ref);
            } catch (deleteError) {
              logger.warn({ error: deleteError, fileRef: ref }, 'Failed to clean up blob after import failure');
            }
          }
        }
        throw error;
      }
    } finally {
      reader?.close();
    }
  }
}

export const importService = new ImportService();
