import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
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

  private async getTargetTenantId(userId: string, targetProjectId?: string): Promise<string | null> {
    if (targetProjectId !== undefined) {
      const [project] = await db.select().from(projects).where(eq(projects.id, targetProjectId)).limit(1);
      if (project === undefined) {
        throw new Error('Project not found');
      }
      const canView = await aclService.hasProjectRole(userId, targetProjectId, 'view');
      if (!canView) {
        throw new Error('Access denied - insufficient permissions for this project');
      }
      return project.tenantId;
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user !== undefined) {
      return user.tenantId;
    }
    return null;
  }

  private async checkCollisions(
    targetTenantId: string,
    extracted: { projects: Set<string>; workflows: Set<string>; tableSlugs: Set<string>; stepAliases: Set<string> },
    result: ImportPreview
  ): Promise<void> {
    if (extracted.projects.size > 0) {
      const existingProjects = await db.select({ name: projects.name })
        .from(projects)
        .where(eq(projects.tenantId, targetTenantId));
      const existingNames = new Set(existingProjects.map(p => p.name).filter(Boolean));
      for (const name of extracted.projects) {
        if (existingNames.has(name)) {
          result.collisions.push({ entity: 'projects', name, type: 'project' });
        }
      }
    }

    if (extracted.workflows.size > 0) {
      const query = db.select({ title: workflows.title })
        .from(workflows)
        .innerJoin(projects, eq(workflows.projectId, projects.id))
        .where(eq(projects.tenantId, targetTenantId));
        
      const existingWorkflows = await query;
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
        .where(eq(datavaultTables.tenantId, targetTenantId));
      const existingSlugs = new Set(existingTables.map(t => t.slug).filter(Boolean));
      for (const slug of extracted.tableSlugs) {
        if (existingSlugs.has(slug)) {
          result.collisions.push({ entity: 'datavault_tables', name: slug, type: 'table_slug' });
        }
      }
    }

    if (extracted.stepAliases.size > 0) {
      const query = db.select({ alias: steps.alias })
        .from(steps)
        .innerJoin(workflows, eq(steps.workflowId, workflows.id))
        .innerJoin(projects, eq(workflows.projectId, projects.id))
        .where(eq(projects.tenantId, targetTenantId));
        
      const existingSteps = await query;
      const existingAliases = new Set(existingSteps.map(s => s.alias).filter(Boolean));
      for (const alias of extracted.stepAliases) {
        if (existingAliases.has(alias)) {
          result.collisions.push({ entity: 'steps', name: alias, type: 'step_alias' });
        }
      }
    }
  }

  private shouldSkipEntity(desc: EntityDescriptor): boolean {
    return desc.fields.includes('role') || desc.fields.includes('tenantRole');
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
        pickedShape[f] = shape[f];
      }
    }
    return z.object(pickedShape).strip();
  }

  private async processEntityStream(
    reader: BundleReader,
    desc: EntityDescriptor,
    extracted: { projects: Set<string>; workflows: Set<string>; tableSlugs: Set<string>; stepAliases: Set<string> },
    result: ImportPreview
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
      if (desc.name === 'steps' && typeof data['alias'] === 'string' && data['alias'] !== '') {
        extracted.stepAliases.add(data['alias']);
      }
      count++;
    }
    
    if (count > 0) {
      result.entityCounts[desc.name] = count;
    }
  }

  async preview(buffer: Buffer, userId: string, targetProjectId?: string): Promise<ImportPreview> {
    const targetTenantId = await this.getTargetTenantId(userId, targetProjectId);
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

      for (const desc of ENTITY_GRAPH) {
        if (this.shouldSkipEntity(desc)) {continue;}
        await this.processEntityStream(reader, desc, extracted, result);
      }
      this.extractManifestMetadata(reader.manifest, result);

      if (targetTenantId !== null) {
        await this.checkCollisions(targetTenantId, extracted, result);
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
    for (const colName of ctx.desc.refs ?? []) {
      const val = data[colName];
      if (typeof val === 'string' && ctx.idMap.has(val)) {
        data[colName] = ctx.idMap.get(val)!;
      }
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

  private async processEntityInsertion(ctx: ProcessEntityContext): Promise<string> {
    let newRootId = '';
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
    }
    return newRootId;
  }

  async apply(buffer: Buffer, userId: string, options: ImportApplyOptions = {}): Promise<string> {
    const targetOwner = await this.resolveTargetOwner(userId, options);
    
    const tmpPath = path.join(os.tmpdir(), `import_apply_${randomUUID()}.ezb`);
    await fs.promises.writeFile(tmpPath, buffer);
    let reader: BundleReader | null = null;
    let newRootId = '';
    
    try {
      reader = new BundleReader(tmpPath);
      await reader.open();
      const manifest = reader.manifest;
      
      const idMap = new Map<string, string>();
      const rootIds = manifest.rootIds;

      // Pass 1: Allocate new UUIDs for every row across all entities
      // This allows forward references (like currentVersionId) to be remapped
      // correctly during insertion in Pass 2.
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
           }
        }
      }

      // Pass 2: Remap foreign keys and insert rows
      await db.transaction(async (tx: DbTransaction) => {
        for (const desc of ENTITY_GRAPH) {
          if (this.shouldSkipEntity(desc)) {continue;}
          
          const rootId = await this.processEntityInsertion({
            tx,
            desc,
            reader: reader as BundleReader,
            targetOwner,
            userId,
            idMap,
            rootIds
          });
          if (rootId) {
            newRootId = rootId;
          }
        }
      });
      
      return newRootId;
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
