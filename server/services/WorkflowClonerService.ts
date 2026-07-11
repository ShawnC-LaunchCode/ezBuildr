/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, max-lines */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import {
  blocks,
  datavaultColumns,
  datavaultDatabaseAccess,
  datavaultDatabases,
  datavaultNumberSequences,
  datavaultRows,
  datavaultTableAccess,
  datavaultTables,
  datavaultValues,
  datavaultWritebackMappings,
  documentHooks,
  lifecycleHooks,
  logicRules,
  organizations,
  projectAccess,
  projects,
  sections,
  steps,
  templateVersions,
  templates,
  transformBlocks,
  users,
  workflowDataSources,
  workflowQueries,
  workflowTemplates,
  workflowVersions,
  workflowAccess,
  workflows,
} from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";
import { projectRepository, workflowRepository, type DbTransaction } from "../repositories";
import { canManageOrg } from "../utils/ownershipAccess";

import { aclService } from "./AclService";
import { datavaultAclService } from "./DatavaultAclService";

import type {
  DatavaultColumn,
  DatavaultDatabase,
  DatavaultTable,
  Project,
  User,
  Workflow,
} from "@shared/schema";

const logger = createLogger({ module: "workflow-cloner" });

type OwnerType = "user" | "org";
type CopyScope = "project" | "workflow";

export interface CopyAssetOptions {
  name?: string;
  targetOwnerType?: OwnerType;
  targetOwnerUuid?: string;
  targetProjectId?: string | null;
  includeRelatedDatavault?: boolean;
  includeDatavaultData?: boolean;
  clearAccess?: boolean;
}

export interface CopyAssetResult {
  project?: Project;
  workflow?: Workflow;
  workflows?: Workflow[];
  copiedDatabases: number;
  copiedTables: number;
  copiedRows: number;
}

interface TargetOwner {
  ownerType: OwnerType;
  ownerUuid: string;
  tenantId: string;
}

interface WorkflowCopyResult {
  workflow: Workflow;
  workflowIdMap: Map<string, string>;
  versionIdMap: Map<string, string>;
  idMap: Map<string, string>;
}

interface RelatedDatavaultResources {
  databases: DatavaultDatabase[];
  tables: DatavaultTable[];
  columns: DatavaultColumn[];
}

interface DatavaultCopyContext {
  scope: CopyScope;
  sourceProjectId?: string;
  targetProjectId?: string;
  sourceWorkflowIds: string[];
  workflowIdMap: Map<string, string>;
  targetOwner: TargetOwner;
  copiedByUserId: string;
  includeData: boolean;
  clearAccess: boolean;
}

interface DatavaultCopyResult {
  idMap: Map<string, string>;
  databaseIdMap: Map<string, string>;
  tableIdMap: Map<string, string>;
  columnIdMap: Map<string, string>;
  rowIdMap: Map<string, string>;
  copiedDatabases: number;
  copiedTables: number;
  copiedRows: number;
}

function prefixedName(name: string, prefix = "dev_"): string {
  const base = name.trim() || "Untitled";
  if (base.toLowerCase().startsWith(prefix)) {
    return base.substring(0, 255);
  }
  return `${prefix}${base}`.substring(0, 255);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "copy";
}

function remapJsonIds<T>(value: T, idMap: Map<string, string>): T {
  if (typeof value === "string") {
    return (idMap.get(value) ?? value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => remapJsonIds(item, idMap)) as T;
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    const remapped: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      remapped[key] = remapJsonIds(nestedValue, idMap);
    }
    return remapped as T;
  }

  return value;
}

function mergeMaps(...maps: Array<Map<string, string>>): Map<string, string> {
  const merged = new Map<string, string>();
  for (const map of maps) {
    for (const [key, value] of map.entries()) {
      merged.set(key, value);
    }
  }
  return merged;
}

export class WorkflowClonerService {
  async copyProject(projectId: string, userId: string, options: CopyAssetOptions = {}): Promise<CopyAssetResult> {
    logger.info({ projectId, userId }, "Copying project");

    const sourceProject = await projectRepository.findById(projectId);
    if (!sourceProject) {
      throw new Error("Project not found");
    }

    const canViewProject = await aclService.hasProjectRole(userId, projectId, "view");
    if (!canViewProject) {
      throw new Error("Access denied - insufficient permissions for this project");
    }

    const targetOwner = await this.resolveTargetOwner(userId, options);
    const clearAccess = options.clearAccess ?? true;
    const includeRelatedDatavault = options.includeRelatedDatavault ?? true;
    const includeData = includeRelatedDatavault && (options.includeDatavaultData ?? false);

    return db.transaction(async (tx) => {
      const title = await this.ensureUniqueProjectTitle(
        tx,
        targetOwner.ownerType,
        targetOwner.ownerUuid,
        options.name ?? prefixedName(sourceProject.title)
      );

      const [newProject] = await tx
        .insert(projects)
        .values({
          title,
          name: title,
          description: sourceProject.description,
          creatorId: userId,
          tenantId: targetOwner.tenantId,
          createdBy: userId,
          ownerId: userId,
          ownerType: targetOwner.ownerType,
          ownerUuid: targetOwner.ownerUuid,
          status: "active",
          archived: false,
        })
        .returning();

      if (newProject === undefined) {
        throw new Error("Failed to copy project");
      }

      const idMap = new Map<string, string>([[sourceProject.id, newProject.id]]);
      const sourceWorkflows = await tx
        .select()
        .from(workflows)
        .where(eq(workflows.projectId, projectId))
        .orderBy(asc(workflows.createdAt));

      const workflowCopies: WorkflowCopyResult[] = [];
      for (const sourceWorkflow of sourceWorkflows) {
        const workflowCopy = await this.copyWorkflowCore(tx, sourceWorkflow, userId, {
          targetProjectId: newProject.id,
          targetOwner,
          clearAccess,
          requestedTitle: prefixedName(sourceWorkflow.title),
        });
        workflowCopies.push(workflowCopy);
        for (const [oldId, newId] of workflowCopy.idMap.entries()) {
          idMap.set(oldId, newId);
        }
      }

      await this.copyProjectTemplates(tx, projectId, newProject.id, userId, workflowCopies, idMap);

      let datavaultResult = this.emptyDatavaultCopyResult();
      if (includeRelatedDatavault) {
        datavaultResult = await this.copyRelatedDatavault(tx, {
          scope: "project",
          sourceProjectId: projectId,
          targetProjectId: newProject.id,
          sourceWorkflowIds: sourceWorkflows.map((workflow) => workflow.id),
          workflowIdMap: this.combineWorkflowIdMaps(workflowCopies),
          targetOwner,
          copiedByUserId: userId,
          includeData,
          clearAccess,
        });
        for (const [oldId, newId] of datavaultResult.idMap.entries()) {
          idMap.set(oldId, newId);
        }
      }

      if (!clearAccess) {
        await this.copyProjectAccess(tx, projectId, newProject.id);
      }

      await this.remapCopiedWorkflowReferences(
        tx,
        workflowCopies.map((copy) => copy.workflow.id),
        idMap
      );

      return {
        project: newProject,
        workflows: workflowCopies.map((copy) => copy.workflow),
        copiedDatabases: datavaultResult.copiedDatabases,
        copiedTables: datavaultResult.copiedTables,
        copiedRows: datavaultResult.copiedRows,
      };
    });
  }

  async copyWorkflow(workflowId: string, userId: string, options: CopyAssetOptions = {}): Promise<CopyAssetResult> {
    logger.info({ workflowId, userId }, "Copying workflow");

    const sourceWorkflow = await workflowRepository.findByIdOrSlug(workflowId);
    if (!sourceWorkflow) {
      throw new Error("Workflow not found");
    }

    const canViewWorkflow = await aclService.hasWorkflowRole(userId, sourceWorkflow.id, "view");
    if (!canViewWorkflow) {
      throw new Error("Access denied - insufficient permissions for this workflow");
    }

    const targetOwner = await this.resolveTargetOwnerForWorkflowCopy(userId, options);
    const clearAccess = options.clearAccess ?? true;
    const includeRelatedDatavault = options.includeRelatedDatavault ?? true;
    const includeData = includeRelatedDatavault && (options.includeDatavaultData ?? false);

    return db.transaction(async (tx) => {
      const workflowCopy = await this.copyWorkflowCore(tx, sourceWorkflow, userId, {
        targetProjectId: options.targetProjectId ?? null,
        targetOwner,
        clearAccess,
        requestedTitle: options.name ?? prefixedName(sourceWorkflow.title),
      });

      let datavaultResult = this.emptyDatavaultCopyResult();
      if (includeRelatedDatavault) {
        datavaultResult = await this.copyRelatedDatavault(tx, {
          scope: "workflow",
          sourceProjectId: sourceWorkflow.projectId ?? undefined,
          targetProjectId: options.targetProjectId ?? undefined,
          sourceWorkflowIds: [sourceWorkflow.id],
          workflowIdMap: workflowCopy.workflowIdMap,
          targetOwner,
          copiedByUserId: userId,
          includeData,
          clearAccess,
        });
      }

      const idMap = mergeMaps(workflowCopy.idMap, datavaultResult.idMap);
      await this.remapCopiedWorkflowReferences(tx, [workflowCopy.workflow.id], idMap);

      return {
        workflow: workflowCopy.workflow,
        copiedDatabases: datavaultResult.copiedDatabases,
        copiedTables: datavaultResult.copiedTables,
        copiedRows: datavaultResult.copiedRows,
      };
    });
  }

  /**
   * Backward-compatible wrapper used by older callers.
   */
  async cloneWorkflow(
    originalWorkflowId: string,
    userId: string,
    targetProjectId?: string,
    params: { name?: string; isFork?: boolean } = {}
  ): Promise<Workflow> {
    const result = await this.copyWorkflow(originalWorkflowId, userId, {
      name: params.name,
      targetProjectId,
      includeRelatedDatavault: false,
      clearAccess: true,
    });
    if (!result.workflow) {
      throw new Error("Failed to copy workflow");
    }
    return result.workflow;
  }

  private async resolveTargetOwner(userId: string, options: CopyAssetOptions): Promise<TargetOwner> {
    const user = await this.getUserOrThrow(userId);
    if (!user.tenantId) {
      throw new Error("User does not have a tenant assigned");
    }

    const ownerType = options.targetOwnerType ?? "user";
    const ownerUuid = options.targetOwnerUuid ?? userId;

    if (ownerType === "user") {
      if (ownerUuid !== userId) {
        throw new Error("Access denied: Can only copy to yourself");
      }
      return { ownerType, ownerUuid, tenantId: user.tenantId };
    }

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, ownerUuid))
      .limit(1);

    if (org === undefined) {
      throw new Error("Target organization not found");
    }

    if (org.tenantId !== user.tenantId) {
      throw new Error("Access denied - target organization belongs to different tenant");
    }

    const canManageTargetOrg = await canManageOrg(userId, ownerUuid);
    if (!canManageTargetOrg) {
      throw new Error("Access denied: Organization admin role required to copy into this organization");
    }

    return { ownerType, ownerUuid, tenantId: user.tenantId };
  }

  private async resolveTargetOwnerForWorkflowCopy(userId: string, options: CopyAssetOptions): Promise<TargetOwner> {
    if (options.targetProjectId) {
      const project = await projectRepository.findById(options.targetProjectId);
      if (!project) {
        throw new Error("Target project not found");
      }

      const hasProjectEdit = await aclService.hasProjectRole(userId, options.targetProjectId, "edit");
      if (!hasProjectEdit) {
        throw new Error("Access denied - insufficient permissions for target project");
      }

      if (project.ownerType === "org" && project.ownerUuid && !(await canManageOrg(userId, project.ownerUuid))) {
        throw new Error("Access denied: Organization admin role required to copy into this organization project");
      }

      const user = await this.getUserOrThrow(userId);
      if (!user.tenantId) {
        throw new Error("User does not have a tenant assigned");
      }

      return {
        ownerType: project.ownerType ?? "user",
        ownerUuid: project.ownerUuid ?? project.ownerId ?? project.createdBy ?? project.creatorId,
        tenantId: project.tenantId ?? user.tenantId,
      };
    }

    return this.resolveTargetOwner(userId, options);
  }

  private async getUserOrThrow(userId: string): Promise<User> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user === undefined) {
      throw new Error("User not found");
    }
    return user;
  }

  private async copyWorkflowCore(
    tx: DbTransaction,
    sourceWorkflow: Workflow,
    userId: string,
    options: {
      targetProjectId: string | null;
      targetOwner: TargetOwner;
      clearAccess: boolean;
      requestedTitle: string;
    }
  ): Promise<WorkflowCopyResult> {
    const idMap = new Map<string, string>();
    const workflowIdMap = new Map<string, string>();
    const versionIdMap = new Map<string, string>();
    const title = await this.ensureUniqueWorkflowTitle(
      tx,
      options.targetOwner.ownerType,
      options.targetOwner.ownerUuid,
      options.targetProjectId,
      options.requestedTitle
    );

    const [newWorkflow] = await tx
      .insert(workflows)
      .values({
        title,
        name: title,
        description: sourceWorkflow.description,
        creatorId: userId,
        ownerId: userId,
        modeOverride: sourceWorkflow.modeOverride,
        publicLink: null,
        projectId: options.targetProjectId,
        currentVersionId: null,
        isPublic: false,
        slug: null,
        requireLogin: sourceWorkflow.requireLogin,
        intakeConfig: sourceWorkflow.intakeConfig,
        pinnedVersionId: null,
        status: "draft",
        ownerType: options.targetOwner.ownerType,
        ownerUuid: options.targetOwner.ownerUuid,
        sourceBlueprintId: sourceWorkflow.sourceBlueprintId,
      })
      .returning();

    if (newWorkflow === undefined) {
      throw new Error("Failed to copy workflow");
    }

    idMap.set(sourceWorkflow.id, newWorkflow.id);
    workflowIdMap.set(sourceWorkflow.id, newWorkflow.id);

    await this.copySectionsAndSteps(tx, sourceWorkflow.id, newWorkflow.id, idMap);
    await this.copyLogicRules(tx, sourceWorkflow.id, newWorkflow.id, idMap);
    await this.copyBlocks(tx, sourceWorkflow.id, newWorkflow.id, idMap);
    await this.copyTransformBlocks(tx, sourceWorkflow.id, newWorkflow.id, idMap);
    await this.copyLifecycleHooks(tx, sourceWorkflow.id, newWorkflow.id, idMap);
    await this.copyDocumentHooks(tx, sourceWorkflow.id, newWorkflow.id, idMap);
    await this.copyWorkflowVersions(tx, sourceWorkflow, newWorkflow, userId, idMap, versionIdMap);

    if (!options.clearAccess) {
      await this.copyWorkflowAccess(tx, sourceWorkflow.id, newWorkflow.id);
    }

    return { workflow: newWorkflow, workflowIdMap, versionIdMap, idMap };
  }

  private async copySectionsAndSteps(
    tx: DbTransaction,
    sourceWorkflowId: string,
    targetWorkflowId: string,
    idMap: Map<string, string>
  ): Promise<void> {
    const sourceSections = await tx
      .select()
      .from(sections)
      .where(eq(sections.workflowId, sourceWorkflowId))
      .orderBy(asc(sections.order));

    for (const sourceSection of sourceSections) {
      const [newSection] = await tx
        .insert(sections)
        .values({
          workflowId: targetWorkflowId,
          title: sourceSection.title,
          description: sourceSection.description,
          order: sourceSection.order,
          config: sourceSection.config,
          visibleIf: sourceSection.visibleIf,
          skipIf: sourceSection.skipIf,
        })
        .returning();

      if (newSection === undefined) {
        throw new Error("Failed to copy section");
      }

      idMap.set(sourceSection.id, newSection.id);

      const sourceSteps = await tx
        .select()
        .from(steps)
        .where(eq(steps.sectionId, sourceSection.id))
        .orderBy(asc(steps.order));

      for (const sourceStep of sourceSteps) {
        const [newStep] = await tx
          .insert(steps)
          .values({
            sectionId: newSection.id,
            type: sourceStep.type,
            title: sourceStep.title,
            description: sourceStep.description,
            required: sourceStep.required,
            options: sourceStep.options,
            alias: sourceStep.alias,
            defaultValue: sourceStep.defaultValue,
            order: sourceStep.order,
            isVirtual: sourceStep.isVirtual,
            visibleIf: sourceStep.visibleIf,
            repeaterConfig: sourceStep.repeaterConfig,
          })
          .returning();

        if (newStep === undefined) {
          throw new Error("Failed to copy step");
        }

        idMap.set(sourceStep.id, newStep.id);
      }
    }
  }

  private async copyLogicRules(
    tx: DbTransaction,
    sourceWorkflowId: string,
    targetWorkflowId: string,
    idMap: Map<string, string>
  ): Promise<void> {
    const sourceRules = await tx
      .select()
      .from(logicRules)
      .where(eq(logicRules.workflowId, sourceWorkflowId))
      .orderBy(asc(logicRules.order));

    if (sourceRules.length === 0) {
      return;
    }

    const copiedRules = sourceRules
        .map((rule) => {
          const conditionStepId = idMap.get(rule.conditionStepId);
          if (!conditionStepId) {
            return null;
          }
          return {
          workflowId: targetWorkflowId,
          conditionStepId,
          operator: rule.operator,
          conditionValue: remapJsonIds(rule.conditionValue, idMap),
          targetType: rule.targetType,
          targetStepId: rule.targetStepId ? idMap.get(rule.targetStepId) ?? null : null,
          targetSectionId: rule.targetSectionId ? idMap.get(rule.targetSectionId) ?? null : null,
          action: rule.action,
          logicalOperator: rule.logicalOperator,
          order: rule.order,
          };
        })
        .filter((rule): rule is NonNullable<typeof rule> => rule !== null);
    if (copiedRules.length > 0) {
      await tx.insert(logicRules).values(copiedRules);
    }
  }

  private async copyBlocks(
    tx: DbTransaction,
    sourceWorkflowId: string,
    targetWorkflowId: string,
    idMap: Map<string, string>
  ): Promise<void> {
    const sourceBlocks = await tx
      .select()
      .from(blocks)
      .where(eq(blocks.workflowId, sourceWorkflowId))
      .orderBy(asc(blocks.order));

    for (const block of sourceBlocks) {
      const [newBlock] = await tx
        .insert(blocks)
        .values({
          workflowId: targetWorkflowId,
          sectionId: block.sectionId ? idMap.get(block.sectionId) ?? null : null,
          type: block.type,
          phase: block.phase,
          config: remapJsonIds(block.config, idMap),
          virtualStepId: block.virtualStepId ? idMap.get(block.virtualStepId) ?? null : null,
          enabled: block.enabled,
          order: block.order,
        })
        .returning();

      if (newBlock !== undefined) {
        idMap.set(block.id, newBlock.id);
      }
    }
  }

  private async copyTransformBlocks(
    tx: DbTransaction,
    sourceWorkflowId: string,
    targetWorkflowId: string,
    idMap: Map<string, string>
  ): Promise<void> {
    const sourceBlocks = await tx
      .select()
      .from(transformBlocks)
      .where(eq(transformBlocks.workflowId, sourceWorkflowId))
      .orderBy(asc(transformBlocks.order));

    for (const block of sourceBlocks) {
      const [newBlock] = await tx
        .insert(transformBlocks)
        .values({
          workflowId: targetWorkflowId,
          sectionId: block.sectionId ? idMap.get(block.sectionId) ?? null : null,
          name: block.name,
          language: block.language,
          code: block.code,
          inputKeys: block.inputKeys,
          outputKey: block.outputKey,
          virtualStepId: block.virtualStepId ? idMap.get(block.virtualStepId) ?? null : null,
          phase: block.phase,
          enabled: block.enabled,
          order: block.order,
          timeoutMs: block.timeoutMs,
        })
        .returning();

      if (newBlock !== undefined) {
        idMap.set(block.id, newBlock.id);
      }
    }
  }

  private async copyLifecycleHooks(
    tx: DbTransaction,
    sourceWorkflowId: string,
    targetWorkflowId: string,
    idMap: Map<string, string>
  ): Promise<void> {
    const hooks = await tx
      .select()
      .from(lifecycleHooks)
      .where(eq(lifecycleHooks.workflowId, sourceWorkflowId))
      .orderBy(asc(lifecycleHooks.order));

    for (const hook of hooks) {
      const [newHook] = await tx
        .insert(lifecycleHooks)
        .values({
          workflowId: targetWorkflowId,
          sectionId: hook.sectionId ? idMap.get(hook.sectionId) ?? null : null,
          name: hook.name,
          phase: hook.phase,
          language: hook.language,
          code: hook.code,
          inputKeys: hook.inputKeys,
          outputKeys: hook.outputKeys,
          virtualStepIds: (hook.virtualStepIds ?? []).map((stepId) => idMap.get(stepId) ?? stepId),
          enabled: hook.enabled,
          order: hook.order,
          timeoutMs: hook.timeoutMs,
          mutationMode: hook.mutationMode,
        })
        .returning();

      if (newHook !== undefined) {
        idMap.set(hook.id, newHook.id);
      }
    }
  }

  private async copyDocumentHooks(
    tx: DbTransaction,
    sourceWorkflowId: string,
    targetWorkflowId: string,
    idMap: Map<string, string>
  ): Promise<void> {
    const hooks = await tx
      .select()
      .from(documentHooks)
      .where(eq(documentHooks.workflowId, sourceWorkflowId))
      .orderBy(asc(documentHooks.order));

    for (const hook of hooks) {
      const [newHook] = await tx
        .insert(documentHooks)
        .values({
          workflowId: targetWorkflowId,
          finalBlockDocumentId: hook.finalBlockDocumentId,
          name: hook.name,
          phase: hook.phase,
          language: hook.language,
          code: hook.code,
          inputKeys: hook.inputKeys,
          outputKeys: hook.outputKeys,
          enabled: hook.enabled,
          order: hook.order,
          timeoutMs: hook.timeoutMs,
        })
        .returning();

      if (newHook !== undefined) {
        idMap.set(hook.id, newHook.id);
      }
    }
  }

  // eslint-disable-next-line max-params
  private async copyWorkflowVersions(
    tx: DbTransaction,
    sourceWorkflow: Workflow,
    newWorkflow: Workflow,
    userId: string,
    idMap: Map<string, string>,
    versionIdMap: Map<string, string>
  ): Promise<void> {
    const versions = await tx
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, sourceWorkflow.id))
      .orderBy(asc(workflowVersions.versionNumber));

    if (versions.length === 0) {
      const [newVersion] = await tx
        .insert(workflowVersions)
        .values({
          workflowId: newWorkflow.id,
          baseId: null,
          versionNumber: 1,
          isDraft: true,
          graphJson: {},
          migrationInfo: null,
          changelog: null,
          notes: "Initial draft via copy",
          checksum: null,
          createdBy: userId,
          published: false,
          publishedAt: null,
        })
        .returning();
      if (newVersion !== undefined) {
        await tx.update(workflows).set({ currentVersionId: newVersion.id }).where(eq(workflows.id, newWorkflow.id));
      }
      return;
    }

    for (const version of versions) {
      const [newVersion] = await tx
        .insert(workflowVersions)
        .values({
          workflowId: newWorkflow.id,
          baseId: version.baseId === sourceWorkflow.id ? newWorkflow.id : null,
          versionNumber: version.versionNumber,
          isDraft: version.isDraft,
          graphJson: remapJsonIds(version.graphJson, idMap),
          migrationInfo: remapJsonIds(version.migrationInfo, idMap),
          changelog: remapJsonIds(version.changelog, idMap),
          notes: version.notes,
          checksum: null,
          createdBy: userId,
          published: false,
          publishedAt: null,
        })
        .returning();

      if (newVersion !== undefined) {
        idMap.set(version.id, newVersion.id);
        versionIdMap.set(version.id, newVersion.id);
      }
    }

    const currentVersionId = sourceWorkflow.currentVersionId ? versionIdMap.get(sourceWorkflow.currentVersionId) ?? null : null;
    const pinnedVersionId = sourceWorkflow.pinnedVersionId ? versionIdMap.get(sourceWorkflow.pinnedVersionId) ?? null : null;
    await tx
      .update(workflows)
      .set({ currentVersionId, pinnedVersionId })
      .where(eq(workflows.id, newWorkflow.id));
  }

  // eslint-disable-next-line max-params
  private async copyProjectTemplates(
    tx: DbTransaction,
    sourceProjectId: string,
    targetProjectId: string,
    userId: string,
    workflowCopies: WorkflowCopyResult[],
    idMap: Map<string, string>
  ): Promise<void> {
    const sourceTemplates = await tx
      .select()
      .from(templates)
      .where(eq(templates.projectId, sourceProjectId));

    if (sourceTemplates.length === 0) {
      return;
    }

    const templateIdMap = new Map<string, string>();
    for (const template of sourceTemplates) {
      const [newTemplate] = await tx
        .insert(templates)
        .values({
          projectId: targetProjectId,
          name: template.name,
          description: template.description,
          fileRef: template.fileRef,
          type: template.type,
          helpersVersion: template.helpersVersion,
          metadata: remapJsonIds(template.metadata, idMap),
          mapping: remapJsonIds(template.mapping, idMap),
          currentVersion: template.currentVersion,
          lastModifiedBy: userId,
        })
        .returning();

      if (newTemplate !== undefined) {
        templateIdMap.set(template.id, newTemplate.id);
        idMap.set(template.id, newTemplate.id);
      }
    }

    for (const template of sourceTemplates) {
      const newTemplateId = templateIdMap.get(template.id);
      if (!newTemplateId) {
        continue;
      }
      const versions = await tx
        .select()
        .from(templateVersions)
        .where(eq(templateVersions.templateId, template.id))
        .orderBy(asc(templateVersions.versionNumber));

      for (const version of versions) {
        const [newVersion] = await tx
          .insert(templateVersions)
          .values({
            templateId: newTemplateId,
            versionNumber: version.versionNumber,
            fileRef: version.fileRef,
            metadata: remapJsonIds(version.metadata, idMap),
            mapping: remapJsonIds(version.mapping, idMap),
            createdBy: userId,
            notes: version.notes,
            isActive: version.isActive,
          })
          .returning();

        if (newVersion !== undefined) {
          idMap.set(version.id, newVersion.id);
        }
      }
    }

    const allSourceVersionIds = workflowCopies.flatMap((copy) => [...copy.versionIdMap.keys()]);
    if (allSourceVersionIds.length === 0) {
      return;
    }

    const links = await tx
      .select()
      .from(workflowTemplates)
      .where(inArray(workflowTemplates.workflowVersionId, allSourceVersionIds));

    const mappedLinks = links
      .map((link) => {
        const newWorkflowVersionId = idMap.get(link.workflowVersionId);
        const newTemplateId = templateIdMap.get(link.templateId);
        if (!newWorkflowVersionId || !newTemplateId) {
          return null;
        }
        return {
          workflowVersionId: newWorkflowVersionId,
          templateId: newTemplateId,
          key: link.key,
          isPrimary: link.isPrimary,
        };
      })
      .filter((link): link is NonNullable<typeof link> => link !== null);

    if (mappedLinks.length > 0) {
      await tx.insert(workflowTemplates).values(mappedLinks);
    }
  }

  private async copyRelatedDatavault(tx: DbTransaction, context: DatavaultCopyContext): Promise<DatavaultCopyResult> {
    const resources = await this.collectRelatedDatavaultResources(tx, context);
    if (resources.databases.length === 0 && resources.tables.length === 0) {
      return this.emptyDatavaultCopyResult();
    }

    const idMap = new Map<string, string>();
    const databaseIdMap = new Map<string, string>();
    const tableIdMap = new Map<string, string>();
    const columnIdMap = new Map<string, string>();
    const rowIdMap = new Map<string, string>();

    for (const database of resources.databases) {
      const [newDatabase] = await tx
        .insert(datavaultDatabases)
        .values({
          tenantId: context.targetOwner.tenantId,
          name: prefixedName(database.name),
          description: database.description,
          type: database.type,
          config: remapJsonIds(database.config, context.workflowIdMap),
          scopeType: this.resolveTargetDatabaseScopeType(database, context),
          scopeId: this.resolveTargetDatabaseScopeId(database, context),
          ownerType: context.targetOwner.ownerType,
          ownerUuid: context.targetOwner.ownerUuid,
        })
        .returning();

      if (newDatabase !== undefined) {
        databaseIdMap.set(database.id, newDatabase.id);
        idMap.set(database.id, newDatabase.id);
      }
    }

    for (const table of resources.tables) {
      const [newTable] = await tx
        .insert(datavaultTables)
        .values({
          tenantId: context.targetOwner.tenantId,
          ownerUserId: context.copiedByUserId,
          databaseId: table.databaseId ? databaseIdMap.get(table.databaseId) ?? null : null,
          name: prefixedName(table.name),
          slug: await this.ensureUniqueTableSlug(tx, context.targetOwner.tenantId, slugify(prefixedName(table.slug ?? table.name))),
          description: table.description,
          ownerType: context.targetOwner.ownerType,
          ownerUuid: context.targetOwner.ownerUuid,
        })
        .returning();

      if (newTable !== undefined) {
        tableIdMap.set(table.id, newTable.id);
        idMap.set(table.id, newTable.id);
      }
    }

    for (const column of resources.columns) {
      const newTableId = tableIdMap.get(column.tableId);
      if (!newTableId) {
        continue;
      }
      const [newColumn] = await tx
        .insert(datavaultColumns)
        .values({
          tableId: newTableId,
          name: column.name,
          slug: column.slug,
          type: column.type,
          description: column.description,
          widthPx: column.widthPx,
          required: column.required,
          isPrimaryKey: column.isPrimaryKey,
          isUnique: column.isUnique,
          orderIndex: column.orderIndex,
          autoNumberStart: column.autoNumberStart,
          autonumberPrefix: column.autonumberPrefix,
          autonumberPadding: column.autonumberPadding,
          autonumberResetPolicy: column.autonumberResetPolicy,
          referenceTableId: column.referenceTableId ? tableIdMap.get(column.referenceTableId) ?? null : null,
          referenceDisplayColumnSlug: column.referenceDisplayColumnSlug,
          options: remapJsonIds(column.options, idMap),
        })
        .returning();

      if (newColumn !== undefined) {
        columnIdMap.set(column.id, newColumn.id);
        idMap.set(column.id, newColumn.id);
      }
    }

    await this.copyDatavaultSequences(tx, resources.tables.map((table) => table.id), context, tableIdMap, columnIdMap);

    let copiedRows = 0;
    if (context.includeData) {
      copiedRows = await this.copyDatavaultRows(tx, resources.tables, context, tableIdMap, columnIdMap, rowIdMap, idMap);
    }

    if (!context.clearAccess) {
      await this.copyDatavaultAccess(tx, databaseIdMap, tableIdMap);
    }

    await this.copyWorkflowDatasourceLinks(tx, context, databaseIdMap);
    await this.copyWorkflowQueries(tx, context, databaseIdMap, tableIdMap, idMap);
    await this.copyWritebackMappings(tx, context, tableIdMap, columnIdMap, idMap);

    return {
      idMap,
      databaseIdMap,
      tableIdMap,
      columnIdMap,
      rowIdMap,
      copiedDatabases: databaseIdMap.size,
      copiedTables: tableIdMap.size,
      copiedRows,
    };
  }

  private async collectRelatedDatavaultResources(
    tx: DbTransaction,
    context: DatavaultCopyContext
  ): Promise<RelatedDatavaultResources> {
    const databaseIds = new Set<string>();
    const tableIds = new Set<string>();

    if (context.sourceProjectId) {
      const projectDatabases = await tx
        .select({ id: datavaultDatabases.id })
        .from(datavaultDatabases)
        .where(
          and(
            eq(datavaultDatabases.tenantId, context.targetOwner.tenantId),
            eq(datavaultDatabases.scopeType, "project"),
            eq(datavaultDatabases.scopeId, context.sourceProjectId)
          )
        );
      projectDatabases.forEach((database) => databaseIds.add(database.id));
    }

    if (context.sourceWorkflowIds.length > 0) {
      const workflowScopedDatabases = await tx
        .select({ id: datavaultDatabases.id })
        .from(datavaultDatabases)
        .where(
          and(
            eq(datavaultDatabases.tenantId, context.targetOwner.tenantId),
            eq(datavaultDatabases.scopeType, "workflow"),
            inArray(datavaultDatabases.scopeId, context.sourceWorkflowIds)
          )
        );
      workflowScopedDatabases.forEach((database) => databaseIds.add(database.id));

      const linkedDatabases = await tx
        .select({ id: workflowDataSources.dataSourceId })
        .from(workflowDataSources)
        .where(inArray(workflowDataSources.workflowId, context.sourceWorkflowIds));
      linkedDatabases.forEach((database) => databaseIds.add(database.id));

      const queries = await tx
        .select({ databaseId: workflowQueries.dataSourceId, tableId: workflowQueries.tableId })
        .from(workflowQueries)
        .where(inArray(workflowQueries.workflowId, context.sourceWorkflowIds));
      queries.forEach((query) => {
        databaseIds.add(query.databaseId);
        tableIds.add(query.tableId);
      });

      const mappings = await tx
        .select({ tableId: datavaultWritebackMappings.tableId })
        .from(datavaultWritebackMappings)
        .where(inArray(datavaultWritebackMappings.workflowId, context.sourceWorkflowIds));
      mappings.forEach((mapping) => tableIds.add(mapping.tableId));
    }

    await this.collectIdsFromWorkflowJson(tx, context.sourceWorkflowIds, context.targetOwner.tenantId, databaseIds, tableIds);
    await this.expandDatavaultRelatedSets(tx, databaseIds, tableIds);

    const databases = databaseIds.size > 0
      ? await tx.select().from(datavaultDatabases).where(inArray(datavaultDatabases.id, [...databaseIds]))
      : [];
    const tables = tableIds.size > 0
      ? await tx.select().from(datavaultTables).where(inArray(datavaultTables.id, [...tableIds]))
      : [];
    const columns = tableIds.size > 0
      ? await tx
        .select()
        .from(datavaultColumns)
        .where(inArray(datavaultColumns.tableId, [...tableIds]))
        .orderBy(asc(datavaultColumns.orderIndex))
      : [];

    const visibleDatabases: DatavaultDatabase[] = [];
    for (const database of databases) {
      const canView = await datavaultAclService.hasDatabaseRole(context.copiedByUserId, database.id, "view", tx);
      if (canView) {
        visibleDatabases.push(database);
      }
    }

    const visibleTables: DatavaultTable[] = [];
    for (const table of tables) {
      const canView = await datavaultAclService.hasTableRole(context.copiedByUserId, table.id, "view", tx);
      if (canView) {
        visibleTables.push(table);
      }
    }

    const visibleTableIds = new Set(visibleTables.map((table) => table.id));
    return {
      databases: visibleDatabases,
      tables: visibleTables,
      columns: columns.filter((column) => visibleTableIds.has(column.tableId)),
    };
  }

  private async collectIdsFromWorkflowJson(
    tx: DbTransaction,
    workflowIds: string[],
    tenantId: string,
    databaseIds: Set<string>,
    tableIds: Set<string>
  ): Promise<void> {
    if (workflowIds.length === 0) {
      return;
    }

    const [tenantDatabases, tenantTables] = await Promise.all([
      tx.select({ id: datavaultDatabases.id }).from(datavaultDatabases).where(eq(datavaultDatabases.tenantId, tenantId)),
      tx.select({ id: datavaultTables.id }).from(datavaultTables).where(eq(datavaultTables.tenantId, tenantId)),
    ]);
    const knownDatabaseIds = new Set(tenantDatabases.map((database) => database.id));
    const knownTableIds = new Set(tenantTables.map((table) => table.id));

    const [workflowRows, sectionRows, stepRows, blockRows, transformRows, versionRows] = await Promise.all([
      tx.select().from(workflows).where(inArray(workflows.id, workflowIds)),
      tx.select().from(sections).where(inArray(sections.workflowId, workflowIds)),
      tx
        .select()
        .from(steps)
        .innerJoin(sections, eq(steps.sectionId, sections.id))
        .where(inArray(sections.workflowId, workflowIds)),
      tx.select().from(blocks).where(inArray(blocks.workflowId, workflowIds)),
      tx.select().from(transformBlocks).where(inArray(transformBlocks.workflowId, workflowIds)),
      tx.select().from(workflowVersions).where(inArray(workflowVersions.workflowId, workflowIds)),
    ]);

    const inspectValues: unknown[] = [
      ...workflowRows.map((workflow) => workflow.intakeConfig),
      ...sectionRows.flatMap((section) => [section.config, section.visibleIf, section.skipIf]),
      ...stepRows.flatMap((row) => [row.steps.options, row.steps.defaultValue, row.steps.visibleIf, row.steps.repeaterConfig]),
      ...blockRows.map((block) => block.config),
      ...versionRows.flatMap((version) => [version.graphJson, version.migrationInfo, version.changelog]),
    ];

    for (const transform of transformRows) {
      inspectValues.push(transform.inputKeys, transform.outputKey);
    }

    for (const value of inspectValues) {
      this.collectKnownIds(value, knownDatabaseIds, databaseIds);
      this.collectKnownIds(value, knownTableIds, tableIds);
    }
  }

  private collectKnownIds(value: unknown, knownIds: Set<string>, selectedIds: Set<string>): void {
    if (typeof value === "string") {
      if (knownIds.has(value)) {
        selectedIds.add(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.collectKnownIds(item, knownIds, selectedIds));
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        this.collectKnownIds(nested, knownIds, selectedIds);
      }
    }
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  private async expandDatavaultRelatedSets(
    tx: DbTransaction,
    databaseIds: Set<string>,
    tableIds: Set<string>
  ): Promise<void> {
    let changed = true;
    while (changed) {
      changed = false;

      if (databaseIds.size > 0) {
        const dbTables = await tx
          .select({ id: datavaultTables.id })
          .from(datavaultTables)
          .where(inArray(datavaultTables.databaseId, [...databaseIds]));
        for (const table of dbTables) {
          if (!tableIds.has(table.id)) {
            tableIds.add(table.id);
            changed = true;
          }
        }
      }

      if (tableIds.size > 0) {
        const selectedTables = await tx
          .select({ databaseId: datavaultTables.databaseId })
          .from(datavaultTables)
          .where(inArray(datavaultTables.id, [...tableIds]));
        for (const table of selectedTables) {
          if (table.databaseId && !databaseIds.has(table.databaseId)) {
            databaseIds.add(table.databaseId);
            changed = true;
          }
        }

        const referenceColumns = await tx
          .select({ referenceTableId: datavaultColumns.referenceTableId })
          .from(datavaultColumns)
          .where(inArray(datavaultColumns.tableId, [...tableIds]));
        for (const column of referenceColumns) {
          if (column.referenceTableId && !tableIds.has(column.referenceTableId)) {
            tableIds.add(column.referenceTableId);
            changed = true;
          }
        }
      }
    }
  }

  private resolveTargetDatabaseScopeType(database: DatavaultDatabase, context: DatavaultCopyContext): "account" | "project" | "workflow" {
    if (database.scopeType === "workflow" && database.scopeId && context.workflowIdMap.has(database.scopeId)) {
      return "workflow";
    }
    if (context.scope === "project" && context.targetProjectId) {
      return "project";
    }
    if (context.scope === "workflow") {
      return context.targetProjectId ? "project" : "workflow";
    }
    return "project";
  }

  private resolveTargetDatabaseScopeId(database: DatavaultDatabase, context: DatavaultCopyContext): string | null {
    const targetScopeType = this.resolveTargetDatabaseScopeType(database, context);
    if (targetScopeType === "project") {
      return context.targetProjectId ?? null;
    }
    if (targetScopeType === "workflow") {
      if (database.scopeType === "workflow" && database.scopeId) {
        return context.workflowIdMap.get(database.scopeId) ?? [...context.workflowIdMap.values()][0] ?? null;
      }
      return [...context.workflowIdMap.values()][0] ?? null;
    }
    return null;
  }

  private async copyDatavaultSequences(
    tx: DbTransaction,
    sourceTableIds: string[],
    context: DatavaultCopyContext,
    tableIdMap: Map<string, string>,
    columnIdMap: Map<string, string>
  ): Promise<void> {
    if (sourceTableIds.length === 0) {
      return;
    }
    const sequences = await tx
      .select()
      .from(datavaultNumberSequences)
      .where(inArray(datavaultNumberSequences.tableId, sourceTableIds));

    const copiedSequences = sequences
      .map((sequence) => {
        const newTableId = tableIdMap.get(sequence.tableId);
        const newColumnId = columnIdMap.get(sequence.columnId);
        if (!newTableId || !newColumnId) {
          return null;
        }
        return {
          tenantId: context.targetOwner.tenantId,
          tableId: newTableId,
          columnId: newColumnId,
          prefix: sequence.prefix,
          padding: sequence.padding,
          nextValue: context.includeData ? sequence.nextValue : 1,
          resetPolicy: sequence.resetPolicy,
          lastReset: context.includeData ? sequence.lastReset : null,
        };
      })
      .filter((sequence): sequence is NonNullable<typeof sequence> => sequence !== null);

    if (copiedSequences.length > 0) {
      await tx.insert(datavaultNumberSequences).values(copiedSequences);
    }
  }

  // eslint-disable-next-line max-params
  private async copyDatavaultRows(
    tx: DbTransaction,
    sourceTables: DatavaultTable[],
    context: DatavaultCopyContext,
    tableIdMap: Map<string, string>,
    columnIdMap: Map<string, string>,
    rowIdMap: Map<string, string>,
    idMap: Map<string, string>
  ): Promise<number> {
    if (sourceTables.length === 0) {
      return 0;
    }

    const sourceTableIds = sourceTables.map((table) => table.id);
    const rows = await tx
      .select()
      .from(datavaultRows)
      .where(and(inArray(datavaultRows.tableId, sourceTableIds), isNull(datavaultRows.deletedAt)))
      .orderBy(asc(datavaultRows.createdAt));

    for (const row of rows) {
      const newTableId = tableIdMap.get(row.tableId);
      if (!newTableId) {
        continue;
      }

      const [newRow] = await tx
        .insert(datavaultRows)
        .values({
          tableId: newTableId,
          deletedAt: null,
          createdBy: context.copiedByUserId,
          updatedBy: context.copiedByUserId,
        })
        .returning();

      if (newRow !== undefined) {
        rowIdMap.set(row.id, newRow.id);
        idMap.set(row.id, newRow.id);
      }
    }

    if (rows.length === 0) {
      return 0;
    }

    const values = await tx
      .select()
      .from(datavaultValues)
      .where(inArray(datavaultValues.rowId, rows.map((row) => row.id)));

    const allIdMap = mergeMaps(idMap, rowIdMap, columnIdMap, tableIdMap, context.workflowIdMap);
    const copiedValues = values
      .map((value) => {
        const newRowId = rowIdMap.get(value.rowId);
        const newColumnId = columnIdMap.get(value.columnId);
        if (!newRowId || !newColumnId) {
          return null;
        }
        return {
          rowId: newRowId,
          columnId: newColumnId,
          value: remapJsonIds(value.value, allIdMap),
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    if (copiedValues.length > 0) {
      await tx.insert(datavaultValues).values(copiedValues);
    }

    return rowIdMap.size;
  }

  private async copyDatavaultAccess(
    tx: DbTransaction,
    databaseIdMap: Map<string, string>,
    tableIdMap: Map<string, string>
  ): Promise<void> {
    if (databaseIdMap.size > 0) {
      const databaseAccessRows = await tx
        .select()
        .from(datavaultDatabaseAccess)
        .where(inArray(datavaultDatabaseAccess.databaseId, [...databaseIdMap.keys()]));
      const copied = databaseAccessRows
        .map((entry) => ({
          databaseId: databaseIdMap.get(entry.databaseId),
          principalType: entry.principalType,
          principalId: entry.principalId,
          role: entry.role,
        }))
        .filter((entry): entry is { databaseId: string; principalType: string; principalId: string; role: string } => Boolean(entry.databaseId));
      if (copied.length > 0) {
        await tx.insert(datavaultDatabaseAccess).values(copied);
      }
    }

    if (tableIdMap.size > 0) {
      const tableAccessRows = await tx
        .select()
        .from(datavaultTableAccess)
        .where(inArray(datavaultTableAccess.tableId, [...tableIdMap.keys()]));
      const copied = tableAccessRows
        .map((entry) => ({
          tableId: tableIdMap.get(entry.tableId),
          principalType: entry.principalType,
          principalId: entry.principalId,
          role: entry.role,
        }))
        .filter((entry): entry is { tableId: string; principalType: string; principalId: string; role: string } => Boolean(entry.tableId));
      if (copied.length > 0) {
        await tx.insert(datavaultTableAccess).values(copied);
      }
    }
  }

  private async copyWorkflowDatasourceLinks(
    tx: DbTransaction,
    context: DatavaultCopyContext,
    databaseIdMap: Map<string, string>
  ): Promise<void> {
    if (context.sourceWorkflowIds.length === 0 || databaseIdMap.size === 0) {
      return;
    }
    const links = await tx
      .select()
      .from(workflowDataSources)
      .where(inArray(workflowDataSources.workflowId, context.sourceWorkflowIds));

    const copiedLinks = links
      .map((link) => {
        const workflowId = context.workflowIdMap.get(link.workflowId);
        const dataSourceId = databaseIdMap.get(link.dataSourceId);
        return workflowId && dataSourceId ? { workflowId, dataSourceId } : null;
      })
      .filter((link): link is { workflowId: string; dataSourceId: string } => link !== null);

    if (copiedLinks.length > 0) {
      await tx.insert(workflowDataSources).values(copiedLinks).onConflictDoNothing();
    }
  }

  private async copyWorkflowQueries(
    tx: DbTransaction,
    context: DatavaultCopyContext,
    databaseIdMap: Map<string, string>,
    tableIdMap: Map<string, string>,
    idMap: Map<string, string>
  ): Promise<void> {
    if (context.sourceWorkflowIds.length === 0) {
      return;
    }
    const queries = await tx
      .select()
      .from(workflowQueries)
      .where(inArray(workflowQueries.workflowId, context.sourceWorkflowIds));

    const allIdMap = mergeMaps(idMap, databaseIdMap, tableIdMap, context.workflowIdMap);
    const copiedQueries = queries
      .map((query) => {
        const workflowId = context.workflowIdMap.get(query.workflowId);
        const dataSourceId = databaseIdMap.get(query.dataSourceId);
        const tableId = tableIdMap.get(query.tableId);
        if (!workflowId || !dataSourceId || !tableId) {
          return null;
        }
        return {
          workflowId,
          dataSourceId,
          tableId,
          name: query.name,
          filters: remapJsonIds(query.filters, allIdMap),
          sort: remapJsonIds(query.sort, allIdMap),
          limit: query.limit,
        };
      })
      .filter((query): query is NonNullable<typeof query> => query !== null);

    if (copiedQueries.length > 0) {
      await tx.insert(workflowQueries).values(copiedQueries);
    }
  }

  private async copyWritebackMappings(
    tx: DbTransaction,
    context: DatavaultCopyContext,
    tableIdMap: Map<string, string>,
    columnIdMap: Map<string, string>,
    idMap: Map<string, string>
  ): Promise<void> {
    if (context.sourceWorkflowIds.length === 0) {
      return;
    }
    const mappings = await tx
      .select()
      .from(datavaultWritebackMappings)
      .where(inArray(datavaultWritebackMappings.workflowId, context.sourceWorkflowIds));

    const allIdMap = mergeMaps(idMap, tableIdMap, columnIdMap, context.workflowIdMap);
    const copiedMappings = mappings
      .map((mapping) => {
        const workflowId = context.workflowIdMap.get(mapping.workflowId);
        const tableId = tableIdMap.get(mapping.tableId);
        if (!workflowId || !tableId) {
          return null;
        }
        return {
          workflowId,
          tableId,
          columnMappings: remapJsonIds(mapping.columnMappings, allIdMap),
          triggerPhase: mapping.triggerPhase,
          createdBy: context.copiedByUserId,
        };
      })
      .filter((mapping): mapping is NonNullable<typeof mapping> => mapping !== null);

    if (copiedMappings.length > 0) {
      await tx.insert(datavaultWritebackMappings).values(copiedMappings);
    }
  }

  private async remapCopiedWorkflowReferences(
    tx: DbTransaction,
    workflowIds: string[],
    idMap: Map<string, string>
  ): Promise<void> {
    if (workflowIds.length === 0 || idMap.size === 0) {
      return;
    }

    const copiedWorkflows = await tx.select().from(workflows).where(inArray(workflows.id, workflowIds));
    for (const workflow of copiedWorkflows) {
      await tx
        .update(workflows)
        .set({ intakeConfig: remapJsonIds(workflow.intakeConfig, idMap) })
        .where(eq(workflows.id, workflow.id));
    }

    const copiedSections = await tx.select().from(sections).where(inArray(sections.workflowId, workflowIds));
    for (const section of copiedSections) {
      await tx
        .update(sections)
        .set({
          config: remapJsonIds(section.config, idMap),
          visibleIf: remapJsonIds(section.visibleIf, idMap),
          skipIf: remapJsonIds(section.skipIf, idMap),
        })
        .where(eq(sections.id, section.id));
    }

    if (copiedSections.length > 0) {
      const copiedSteps = await tx
        .select()
        .from(steps)
        .where(inArray(steps.sectionId, copiedSections.map((section) => section.id)));
      for (const step of copiedSteps) {
        await tx
          .update(steps)
          .set({
            options: remapJsonIds(step.options, idMap),
            defaultValue: remapJsonIds(step.defaultValue, idMap),
            visibleIf: remapJsonIds(step.visibleIf, idMap),
            repeaterConfig: remapJsonIds(step.repeaterConfig, idMap),
          })
          .where(eq(steps.id, step.id));
      }
    }

    const copiedRules = await tx.select().from(logicRules).where(inArray(logicRules.workflowId, workflowIds));
    for (const rule of copiedRules) {
      await tx
        .update(logicRules)
        .set({ conditionValue: remapJsonIds(rule.conditionValue, idMap) })
        .where(eq(logicRules.id, rule.id));
    }

    const copiedBlocks = await tx.select().from(blocks).where(inArray(blocks.workflowId, workflowIds));
    for (const block of copiedBlocks) {
      await tx
        .update(blocks)
        .set({ config: remapJsonIds(block.config, idMap) })
        .where(eq(blocks.id, block.id));
    }

    const copiedVersions = await tx.select().from(workflowVersions).where(inArray(workflowVersions.workflowId, workflowIds));
    for (const version of copiedVersions) {
      await tx
        .update(workflowVersions)
        .set({
          graphJson: remapJsonIds(version.graphJson, idMap),
          migrationInfo: remapJsonIds(version.migrationInfo, idMap),
          changelog: remapJsonIds(version.changelog, idMap),
        })
        .where(eq(workflowVersions.id, version.id));
    }
  }

  private async copyProjectAccess(tx: DbTransaction, sourceProjectId: string, targetProjectId: string): Promise<void> {
    const accessRows = await tx.select().from(projectAccess).where(eq(projectAccess.projectId, sourceProjectId));
    if (accessRows.length === 0) {
      return;
    }
    await tx.insert(projectAccess).values(
      accessRows.map((entry) => ({
        projectId: targetProjectId,
        principalType: entry.principalType,
        principalId: entry.principalId,
        role: entry.role,
      }))
    );
  }

  private async copyWorkflowAccess(tx: DbTransaction, sourceWorkflowId: string, targetWorkflowId: string): Promise<void> {
    const accessRows = await tx.select().from(workflowAccess).where(eq(workflowAccess.workflowId, sourceWorkflowId));
    if (accessRows.length === 0) {
      return;
    }
    await tx.insert(workflowAccess).values(
      accessRows.map((entry) => ({
        workflowId: targetWorkflowId,
        principalType: entry.principalType,
        principalId: entry.principalId,
        role: entry.role,
      }))
    );
  }

  private async ensureUniqueProjectTitle(
    tx: DbTransaction,
    ownerType: OwnerType,
    ownerUuid: string,
    requestedTitle: string
  ): Promise<string> {
    let candidate = requestedTitle.substring(0, 255);
    let counter = 2;
    while (await this.projectTitleExists(tx, ownerType, ownerUuid, candidate)) {
      const suffix = ` (${counter})`;
      candidate = `${requestedTitle.substring(0, 255 - suffix.length)}${suffix}`;
      counter++;
    }
    return candidate;
  }

  private async projectTitleExists(
    tx: DbTransaction,
    ownerType: OwnerType,
    ownerUuid: string,
    title: string
  ): Promise<boolean> {
    const [existing] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.ownerType, ownerType), eq(projects.ownerUuid, ownerUuid), eq(projects.title, title)))
      .limit(1);
    return existing !== undefined;
  }

  private async ensureUniqueWorkflowTitle(
    tx: DbTransaction,
    ownerType: OwnerType,
    ownerUuid: string,
    projectId: string | null,
    requestedTitle: string
  ): Promise<string> {
    let candidate = requestedTitle.substring(0, 255);
    let counter = 2;
    while (await this.workflowTitleExists(tx, ownerType, ownerUuid, projectId, candidate)) {
      const suffix = ` (${counter})`;
      candidate = `${requestedTitle.substring(0, 255 - suffix.length)}${suffix}`;
      counter++;
    }
    return candidate;
  }

  private async workflowTitleExists(
    tx: DbTransaction,
    ownerType: OwnerType,
    ownerUuid: string,
    projectId: string | null,
    title: string
  ): Promise<boolean> {
    const projectCondition = projectId === null ? isNull(workflows.projectId) : eq(workflows.projectId, projectId);
    const [existing] = await tx
      .select({ id: workflows.id })
      .from(workflows)
      .where(and(eq(workflows.ownerType, ownerType), eq(workflows.ownerUuid, ownerUuid), projectCondition, eq(workflows.title, title)))
      .limit(1);
    return existing !== undefined;
  }

  private async ensureUniqueTableSlug(tx: DbTransaction, tenantId: string, requestedSlug: string): Promise<string> {
    let candidate = requestedSlug.substring(0, 255);
    let counter = 2;
    while (await this.tableSlugExists(tx, tenantId, candidate)) {
      const suffix = `-${counter}`;
      candidate = `${requestedSlug.substring(0, 255 - suffix.length)}${suffix}`;
      counter++;
    }
    return candidate;
  }

  private async tableSlugExists(tx: DbTransaction, tenantId: string, slug: string): Promise<boolean> {
    const [existing] = await tx
      .select({ id: datavaultTables.id })
      .from(datavaultTables)
      .where(and(eq(datavaultTables.tenantId, tenantId), eq(datavaultTables.slug, slug)))
      .limit(1);
    return existing !== undefined;
  }

  private combineWorkflowIdMaps(workflowCopies: WorkflowCopyResult[]): Map<string, string> {
    const workflowIdMap = new Map<string, string>();
    for (const copy of workflowCopies) {
      for (const [oldId, newId] of copy.workflowIdMap.entries()) {
        workflowIdMap.set(oldId, newId);
      }
    }
    return workflowIdMap;
  }

  private emptyDatavaultCopyResult(): DatavaultCopyResult {
    return {
      idMap: new Map<string, string>(),
      databaseIdMap: new Map<string, string>(),
      tableIdMap: new Map<string, string>(),
      columnIdMap: new Map<string, string>(),
      rowIdMap: new Map<string, string>(),
      copiedDatabases: 0,
      copiedTables: 0,
      copiedRows: 0,
    };
  }
}

export const workflowClonerService = new WorkflowClonerService();
