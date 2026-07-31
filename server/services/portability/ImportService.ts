import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID, createHash } from 'crypto';
import { z } from 'zod';
import { BundleReader } from './bundleReader';
import { ENTITY_GRAPH, EntityDescriptor } from './entityGraph';
import { ExportWarning, RequiresReentry, BundleManifest } from './bundleFormat';
import { db } from '../../db';
import { projects, workflows, datavaultTables, steps, users, organizations } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { aclService } from '../AclService';
import { projectRepository, type DbTransaction } from '../../repositories';
import { canManageOrg } from '../../utils/ownershipAccess';
import { remapJsonIds } from '../../utils/remapJsonIds';
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
  warnings: ExportWarning[];
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

  private async getTargetOwnerForPreview(userId: string, targetProjectId?: string): Promise<TargetOwner | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user?.tenantId == null) {
      return null;
    }

    if (targetProjectId !== undefined) {
      const [project] = await db.select().from(projects).where(eq(projects.id, targetProjectId)).limit(1);
      if (project === undefined) {
        throw new Error('Project not found');
      }
      const canView = await aclService.hasProjectRole(userId, targetProjectId, 'view');
      if (!canView) {
        throw new Error('Access denied - insufficient permissions for this project');
      }
      return {
        ownerType: project.ownerType ?? 'user',
        ownerUuid: project.ownerUuid ?? project.ownerId ?? project.createdBy ?? project.creatorId ?? userId,
        tenantId: project.tenantId ?? user.tenantId
      };
    }
    return {
      ownerType: 'user',
      ownerUuid: userId,
      tenantId: user.tenantId
    };
  }

  private async checkCollisions(
    targetOwner: TargetOwner,
    targetProjectId: string | undefined,
    extracted: { projects: Set<string>; workflows: Set<string>; tableSlugs: Set<string>; stepAliases: Set<string> },
    result: ImportPreview
  ): Promise<void> {
    if (extracted.projects.size > 0) {
      const existingProjects = await db.select({ name: projects.title })
        .from(projects)
        .where(and(
          eq(projects.ownerType, targetOwner.ownerType),
          eq(projects.ownerUuid, targetOwner.ownerUuid)
        ));
      const existingNames = new Set(existingProjects.map(p => p.name).filter(Boolean));
      for (const name of extracted.projects) {
        if (existingNames.has(name)) {
          result.collisions.push({ entity: 'projects', name, type: 'project' });
        }
      }
    }

    if (extracted.workflows.size > 0 && extracted.projects.size === 0) {
      const projectCondition = targetProjectId ? eq(workflows.projectId, targetProjectId) : isNull(workflows.projectId);
      const existingWorkflows = await db.select({ title: workflows.title })
        .from(workflows)
        .where(and(
          eq(workflows.ownerType, targetOwner.ownerType),
          eq(workflows.ownerUuid, targetOwner.ownerUuid),
          projectCondition
        ));
        
      const existingNames = new Set(existingWorkflows.map(w => w.title).filter(Boolean));
      for (const title of extracted.workflows) {
        if (existingNames.has(title)) {
          result.collisions.push({ entity: 'workflows', name: title, type: 'workflow' });
        }
      }
    }

    if (extracted.tableSlugs.size > 0) {
      const existingTables = await db.select({ slug: datavaultTables.slug })
        .from(datavaultTables)
        .where(eq(datavaultTables.tenantId, targetOwner.tenantId));
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
        pickedShape[f] = this.wrapDateField(shape[f]);
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

  private checkDanglingReferences(desc: EntityDescriptor, data: Record<string, unknown>, bundleIds: Set<string>, result: ImportPreview): void {
    for (const colName of desc.refs ?? []) {
      const val = data[colName];
      if (typeof val === 'string' && val !== '' && !bundleIds.has(val)) {
        if (desc.name === 'workflows' && colName === 'projectId') {
          // workflows.projectId is allowed to pass through if it's the caller's own project
          // (same-system re-import). resolveProjectIdOverride will unparent it if unauthorized.
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
          if (ctx.desc.name === 'workflows' && colName === 'projectId') {
            // workflows.projectId is allowed to pass through if it's the caller's own project
            // (same-system re-import). resolveProjectIdOverride will unparent it if unauthorized.
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

      count++;
    }
    
    if (count > 0) {
      result.entityCounts[desc.name] = count;
    }
  }

  async preview(buffer: Buffer, userId: string, targetProjectId?: string): Promise<ImportPreview> {
    const targetOwner = await this.getTargetOwnerForPreview(userId, targetProjectId);
    const tmpPath = path.join(os.tmpdir(), `import_preview_${randomUUID()}.ezb`);
    await fs.promises.writeFile(tmpPath, buffer);
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
      reader = new BundleReader(tmpPath);
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
      try {
        await fs.promises.rm(tmpPath, { force: true });
      } catch (err) {
        // Ignore removal error
      }
    }

    return result;
  }
  
  private async resolveTargetOwnerForProject(userId: string, tenantId: string, targetProjectId: string): Promise<TargetOwner> {
    const project = await projectRepository.findById(targetProjectId);
    if (project === undefined) { throw new Error('Target project not found'); }

    const hasProjectEdit = await aclService.hasProjectRole(userId, targetProjectId, 'edit');
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
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
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
      const [org] = await db.select().from(organizations).where(eq(organizations.id, ownerUuid)).limit(1);
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

    // Gates 2 and 3 — integrity then scan, deduplicated by content hash so a
    // blob shared by many rows is verified and scanned exactly once.
    const verified = new Map<string, Buffer>();
    for (const [fileRef, meta] of entries) {
      if (verified.has(meta.sha256)) {continue;}

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

      verified.set(meta.sha256, buffer);
    }

    // Gate 4 — every blob passed; now write. One stored object per unique hash.
    const written = new Map<string, string>();
    for (const [fileRef, meta] of entries) {
      let newRef = written.get(meta.sha256);
      if (newRef === undefined) {
        const buffer = verified.get(meta.sha256);
        if (buffer === undefined) {continue;}
        newRef = await storageProvider.saveFile(buffer, meta.filename, meta.mimeType);
        written.set(meta.sha256, newRef);
      }
      mapping.set(fileRef, newRef);
    }

    return mapping;
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
      const project = await projectRepository.findById(projectId);
      const sameTenant = project !== undefined && project.tenantId === targetOwner.tenantId;
      const canEdit = sameTenant && await aclService.hasProjectRole(userId, projectId, 'edit');
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

  private async processSingleEntity(
    ctx: ProcessEntityContext,
    data: Record<string, unknown>,
    oldId: string | undefined
  ): Promise<string | null> {
    // Role-bearing entities are dropped wholesale by shouldSkipEntity(), and any
    // other entity's `role`/`tenantRole` is stripped by the desc.fields allowlist
    // in getZodSchema(), so no per-row role scrubbing is needed here.

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
    for (const col of ctx.desc.blobRefs ?? []) {
      const value = data[col];
      if (typeof value === 'string' && value !== '') {
        data[col] = ctx.blobMap.get(value) ?? '';
      }
    }

    // Re-parent an imported workflow whose project did not travel with it.
    // Decided once, before the transaction, by resolveProjectIdOverride.
    if (ctx.desc.name === 'workflows' && ctx.projectIdOverride !== undefined) {
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
    
    await this.enforceNameUniqueness(ctx, data);
    await ctx.tx.insert(ctx.desc.table).values(data as never);
    
    if (oldId !== undefined && ctx.rootIds.includes(oldId)) {
      return newId;
    }
    return null;
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
      
      const rootId = await this.processSingleEntity(ctx, data, oldId);
      if (rootId) {
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

  async apply(buffer: Buffer, userId: string, options: ImportApplyOptions = {}): Promise<ImportApplyResult> {
    const targetOwner = await this.resolveTargetOwner(userId, options);

    const tmpPath = path.join(os.tmpdir(), `import_apply_${randomUUID()}.ezb`);
    await fs.promises.writeFile(tmpPath, buffer);
    let reader: BundleReader | null = null;
    let newRootId = '';
    const warnings: ExportWarning[] = [];
    const adjustments: string[] = [];

    try {
      reader = new BundleReader(tmpPath);
      await reader.open();
      const manifest = reader.manifest;

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

        // Pass 2: Remap foreign keys and insert rows
        await db.transaction(async (tx: DbTransaction) => {
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
              warnings
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
      try {
        await fs.promises.rm(tmpPath, { force: true });
      } catch (err) {
        // Ignore
      }
    }
  }
}

export const importService = new ImportService();
