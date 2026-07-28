import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { BundleReader } from './bundleReader';
import { ENTITY_GRAPH, EntityDescriptor } from './entityGraph';
import { ExportWarning, RequiresReentry } from './bundleFormat';
import { db } from '../../db';
import { projects, workflows, datavaultTables, steps, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { aclService } from '../AclService';

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

export class ImportService {
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

  private async processEntityStream(
    reader: BundleReader,
    desc: EntityDescriptor,
    extracted: { projects: Set<string>; workflows: Set<string>; tableSlugs: Set<string>; stepAliases: Set<string> },
    result: ImportPreview
  ): Promise<void> {
    let count = 0;
    
    // AC 3: Validate against a per-entity schema derived from the descriptor's fields.
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
    // z.object().strip() guarantees any smuggled field not in desc.fields is dropped.
    const schema = z.object(pickedShape).strip();
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
        await this.processEntityStream(reader, desc, extracted, result);
      }

      if (reader.manifest.requiresReentry !== undefined) {
        for (const entry of reader.manifest.requiresReentry) {
          if (entry.type === 'secret' || entry.type === 'connection') {
            result.requiresReentry.push(entry);
          }
        }
      }

      if (reader.manifest.warnings !== undefined) {
        for (const warn of reader.manifest.warnings) {
          if (warn.type === 'missing_blob' || warn.type === 'secret_scan') {
            result.warnings.push(warn);
          }
        }
      }

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
}

export const importService = new ImportService();
