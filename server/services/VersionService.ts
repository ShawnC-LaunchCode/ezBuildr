import { eq, desc } from "drizzle-orm";
import { z } from "zod";

import * as schema from "@shared/schema";
import type { WorkflowVersion } from "@shared/schema";
import type { WorkflowJSON } from "@shared/types/workflow";

import { WorkflowGraphSchema } from "../../shared/zod-schemas.js";
import { db } from "../db";
import { createLogger } from "../logger";
import { computeChecksum } from "../utils/checksum";

import { aclService } from "./AclService";
import { workflowDiffService, type WorkflowDiff } from "./diff/WorkflowDiffService";
// eslint-disable-next-line import/no-cycle
import { workflowService } from "./WorkflowService";
import type { WorkflowContentData } from "./WorkflowContentIngestService";

type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
const logger = createLogger({ module: "version-service" });
const WORKFLOW_ACCESS_DENIED_MSG = "Access denied - insufficient permissions for this workflow";





/**
 * Version validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
/**
 * Service for workflow version management
 * Handles publishing, rollback, pinning, and diffing
 */
export class VersionService {
  /**
   * List all versions for a workflow
   */
  async listVersions(workflowId: string, userId?: string): Promise<WorkflowVersion[]> {
    // If userId is provided, verify user has access to the workflow
    if (userId) {
      const hasAccess = await aclService.hasWorkflowRole(userId, workflowId, 'view');
      if (!hasAccess) {
        throw new Error(WORKFLOW_ACCESS_DENIED_MSG);
      }
    }
    return db
      .select()
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.workflowId, workflowId))
      .orderBy(desc(schema.workflowVersions.createdAt));
  }
  /**
   * Get a specific version
   */
  async getVersion(versionId: string): Promise<WorkflowVersion | null> {
    const [version] = await db
      .select()
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.id, versionId))
      .limit(1);
    return version ?? null;
  }
  /**
   * Validate workflow before publishing
   * Checks for:
   * - Acyclic graph
   * - Valid expressions
   * - Template placeholders resolved
   * - Required collections exist
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity, complexity

  async serializeWorkflow(workflowId: string, userId: string): Promise<WorkflowContentData> {
    const fullData = await workflowService.getWorkflowWithDetails(workflowId, userId);
    const [blocks, documentHooks, lifecycleHooks] = await Promise.all([
      db.query.blocks.findMany({ where: (block, { eq }) => eq(block.workflowId, workflowId), orderBy: (block, { asc }) => [asc(block.order)] }),
      db.query.documentHooks.findMany({ where: (dh, { eq }) => eq(dh.workflowId, workflowId), orderBy: (dh, { asc }) => [asc(dh.order)] }),
      db.query.lifecycleHooks.findMany({ where: (lh, { eq }) => eq(lh.workflowId, workflowId), orderBy: (lh, { asc }) => [asc(lh.order)] }),
    ]);

    const stepIdToAlias = new Map<string, string>();
    const sectionIdToAlias = new Map<string, string>();
    for (const section of fullData.sections) { sectionIdToAlias.set(section.id, section.title); }

    for (const section of fullData.sections) {
      for (const step of section.steps) {
        if (step.alias) { stepIdToAlias.set(step.id, step.alias); }
      }
    }

    return {
      title: fullData.title,
      description: fullData.description ?? undefined,
      projectId: fullData.projectId,
      settings: fullData.settings as Record<string, unknown>,
      intakeConfig: fullData.intakeConfig as Record<string, unknown>,
      sections: fullData.sections.map(section => ({
        id: section.id,
        title: section.title,
        description: section.description ?? undefined,
        order: section.order,
        // JSONB expressions are preserved verbatim; the ingest DTO retains its
        // legacy string annotation for compatibility with WorkflowService.
        visibleIf: (section.visibleIf ?? undefined) as string | undefined,
        skipIf: section.skipIf ?? undefined,
        config: section.config as Record<string, unknown> | undefined,
        steps: section.steps.map(step => ({
          id: step.id,
          type: step.type,
          title: step.title,
          description: step.description ?? undefined,
          required: step.required ?? undefined,
          config: step.config as Record<string, unknown> | undefined,
          order: step.order,
          alias: step.alias ?? undefined,
          visibleIf: (step.visibleIf ?? undefined) as string | undefined,
          repeaterConfig: step.repeaterConfig as Record<string, unknown> | undefined,
          defaultValue: step.defaultValue ?? undefined,
          isVirtual: step.isVirtual,
        })),
      })),
      logicRules: fullData.logicRules.map(rule => ({
        id: rule.id,
        conditionStepId: rule.conditionStepId ?? undefined,
        conditionStepAlias: rule.conditionStepId ? (stepIdToAlias.get(rule.conditionStepId) ?? rule.conditionStepId) : '',
        operator: rule.operator,
        conditionValue: rule.conditionValue as string,
        targetType: rule.targetType,
        targetId: rule.targetType === 'section' ? (rule.targetSectionId ?? undefined) : (rule.targetStepId ?? undefined),
        targetAlias: (rule.targetType === 'section' && rule.targetSectionId) ? (sectionIdToAlias.get(rule.targetSectionId) ?? rule.targetSectionId) : (rule.targetStepId ? (stepIdToAlias.get(rule.targetStepId) ?? rule.targetStepId) : ''),
        action: rule.action,
        logicalOperator: rule.logicalOperator,
        order: rule.order,
      })),
      blocks: blocks.map(block => ({
        id: block.id,
        sectionId: block.sectionId,
        type: block.type,
        phase: block.phase,
        config: block.config,
        virtualStepId: block.virtualStepId,
        enabled: block.enabled,
        order: block.order,
      })),
      transformBlocks: fullData.transformBlocks.map(block => ({
        id: block.id,
        sectionId: block.sectionId,
        phase: block.phase,
        name: block.name,
        code: block.code,
        language: block.language,
        inputKeys: block.inputKeys ?? undefined,
        outputAlias: block.outputKey ?? undefined,
        outputKey: block.outputKey,
        virtualStepId: block.virtualStepId,
        enabled: block.enabled,
        order: block.order,
        timeoutMs: block.timeoutMs,
      })),
      lifecycleHooks: lifecycleHooks.map(hook => ({
        id: hook.id,
        sectionId: hook.sectionId,
        phase: hook.phase,
        name: hook.name,
        code: hook.code,
        language: hook.language,
        inputKeys: hook.inputKeys ?? undefined,
        outputAlias: (Array.isArray(hook.outputKeys) && hook.outputKeys.length > 0) ? hook.outputKeys[0] : undefined,
        outputKeys: hook.outputKeys,
        virtualStepIds: hook.virtualStepIds,
        order: hook.order,
        isEnabled: hook.enabled,
        enabled: hook.enabled,
        timeoutMs: hook.timeoutMs,
        mutationMode: hook.mutationMode,
      })),
      documentHooks: documentHooks.map(hook => ({
        id: hook.id,
        finalBlockDocumentId: hook.finalBlockDocumentId,
        phase: hook.phase,
        name: hook.name,
        code: hook.code,
        language: hook.language,
        inputKeys: hook.inputKeys ?? undefined,
        outputAlias: (Array.isArray(hook.outputKeys) && hook.outputKeys.length > 0) ? hook.outputKeys[0] : undefined,
        outputKeys: hook.outputKeys,
        order: hook.order,
        isEnabled: hook.enabled,
        enabled: hook.enabled,
        timeoutMs: hook.timeoutMs,
      })),
    };
  }

  validateWorkflow(_workflowId: string, _graphJson: WorkflowGraph): ValidationResult {
    return { valid: true, errors: [], warnings: [] };
  }
  /**
   * Detect cycles in graph using DFS
   */
  async createDraftVersion(
      workflowId: string,
      userId: string,
      notes?: string,
      metadata?: Record<string, unknown>
    ): Promise<WorkflowVersion | null> {
      const graphJson = await this.serializeWorkflow(workflowId, userId) as unknown as WorkflowGraph;
    // Compute checksum
    const checksum = computeChecksum({ graphJson: graphJson as unknown as Record<string, unknown> });
    // Fetch the LATEST version for this workflow.
    const [latestVersion] = await db
      .select()
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.workflowId, workflowId))
      .orderBy(desc(schema.workflowVersions.createdAt))
      .limit(1);
    // If checksum matches latest, no changes - return null
    if (latestVersion !== null && latestVersion !== undefined && latestVersion.checksum === checksum) {
      logger.debug({ workflowId, checksum }, "No changes detected, skipping draft version creation");
      return null;
    }
    // Compute diff against latest version for changelog
    let changelog: WorkflowDiff | null = null;
    if (latestVersion !== null && latestVersion !== undefined) {
      changelog = workflowDiffService.diff(latestVersion.graphJson as WorkflowJSON, graphJson as unknown as WorkflowJSON);
    }
    // Determine version number
    const versionNumber = latestVersion !== null && latestVersion !== undefined ? (latestVersion.versionNumber === 0 ? 1 : latestVersion.versionNumber) + 1 : 1;
    const [newVersion] = await db
      .insert(schema.workflowVersions)
      .values({
        workflowId,
        graphJson,
        createdBy: userId,
        isDraft: true,
        published: false,
        versionNumber,
        notes,
        checksum,
        changelog,
        // metadata field is actually migration_info in the schema
        migrationInfo: metadata !== null && metadata !== undefined ? { aiMetadata: metadata } : null,
      })
      .returning();
    if (newVersion === undefined) {
      throw new Error("Failed to create draft version");
    }
    // Log audit event
    await db.insert(schema.auditLogs).values({
      userId: userId,
      entityType: 'workflow_version',
      entityId: newVersion.id,
      action: 'create_draft_version',
      details: {
        notes,
        checksum,
        versionNumber,
        changelog,
        metadata,
      },
    });
    logger.info({ workflowId, versionId: newVersion.id, userId, versionNumber }, "Created draft version");
    return newVersion;
  }
  /**
   * Publish a new version
   * Creates an immutable snapshot with checksum and updates workflow.currentVersionId
   * This is for user-initiated publishes (moving from draft to active)
   */
  async publishVersion(
      workflowId: string,
      userId: string,
      notes?: string,
      force: boolean = false
    ): Promise<WorkflowVersion> {
      const graphJson = await this.serializeWorkflow(workflowId, userId) as unknown as WorkflowGraph;
    const hasAccess = await aclService.hasWorkflowRole(userId, workflowId, 'edit');
    if (!hasAccess) {
      throw new Error(WORKFLOW_ACCESS_DENIED_MSG);
    }

    // Validate workflow
    const validation = this.validateWorkflow(workflowId, graphJson);
    if (!validation.valid && !force) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    // Compute checksum
    const checksum = computeChecksum({ graphJson: graphJson as unknown as Record<string, unknown> });
    // Compute diff against latest version for changelog
    let changelog: WorkflowDiff | null = null;
    // Fetch the LATEST version for this workflow.
    const [latestVersion] = await db
      .select()
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.workflowId, workflowId))
      .orderBy(desc(schema.workflowVersions.createdAt))
      .limit(1);
    if (latestVersion !== null && latestVersion !== undefined) {
      changelog = workflowDiffService.diff(latestVersion.graphJson as WorkflowJSON, graphJson as unknown as WorkflowJSON);
    }
    // Determine version number
    const versionNumber = latestVersion !== null && latestVersion !== undefined ? (latestVersion.versionNumber === 0 ? 1 : latestVersion.versionNumber) + 1 : 1;
    // Create new version (published)
    const [newVersion] = await db
      .insert(schema.workflowVersions)
      .values({
        workflowId,
        graphJson,
        createdBy: userId,
        isDraft: false, // published
        published: true,
        publishedAt: new Date(),
        versionNumber,
        notes,
        checksum,
        changelog,
      })
      .returning();
    if (newVersion === undefined) {
      throw new Error("Failed to create published version");
    }
    // Update workflow's currentVersionId and status to active
    await db
      .update(schema.workflows)
      .set({
        currentVersionId: newVersion.id,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(schema.workflows.id, workflowId));
    // Log audit event
    await db.insert(schema.auditLogs).values({
      userId: userId,
      entityType: 'workflow_version',
      entityId: newVersion.id,
      action: 'publish',
      details: {
        notes,
        checksum,
        versionNumber,
        validationWarnings: validation.warnings,
        forced: force,
        changelog
      },
    });
    logger.info({ workflowId, versionId: newVersion.id, userId, versionNumber }, "Published new version");
    return newVersion;
  }
  /**
   * Rollback to a previous version
   * Sets currentVersionId to the specified version
   * Works with both draft and published versions
   */
  async rollbackToVersion(
    workflowId: string,
    toVersionId: string,
    userId: string,
    notes?: string
  ): Promise<void> {
    const hasAccess = await aclService.hasWorkflowRole(userId, workflowId, 'edit');
    if (!hasAccess) {
      throw new Error(WORKFLOW_ACCESS_DENIED_MSG);
    }

    // Verify version exists and belongs to workflow
    const version = await this.getVersion(toVersionId);
    if (!version || version.workflowId !== workflowId) {
      throw new Error("Version not found or does not belong to this workflow");
    }
    // Update workflow's currentVersionId
    await db
      .update(schema.workflows)
      .set({
        currentVersionId: toVersionId,
        updatedAt: new Date(),
      })
      .where(eq(schema.workflows.id, workflowId));
    // Log audit event
    await db.insert(schema.auditLogs).values({
      userId: userId,
      entityType: 'workflow',
      entityId: workflowId,
      action: 'rollback',
      details: {
        toVersionId,
        notes,
        isDraft: version.isDraft,
      },
    });
    logger.info({ workflowId, toVersionId, userId, isDraft: version.isDraft }, "Rolled back to version");
  }
  /**
   * Restore workflow to a specific version (creates new draft version with same content)
   * This is preferred for AI undo operations as it preserves full history
   */
  async restoreToVersion(
    workflowId: string,
    fromVersionId: string,
    userId: string,
    notes?: string
  ): Promise<WorkflowVersion> {
    // Verify source version exists and belongs to workflow
    const sourceVersion = await this.getVersion(fromVersionId);
    if (!sourceVersion || sourceVersion.workflowId !== workflowId) {
      throw new Error("Source version not found or does not belong to this workflow");
    }
    // Create a new draft version with the same graphJson
    const restoredVersion = await this.createDraftVersion(
      workflowId,
      userId,
      notes ?? `Restored from version ${sourceVersion.versionNumber !== 0 ? String(sourceVersion.versionNumber) : fromVersionId}`,
      { restoredFrom: fromVersionId }
    );
    if (!restoredVersion) {
      throw new Error("Failed to create restored version (no changes detected)");
    }
    // Log audit event
    await db.insert(schema.auditLogs).values({
      userId: userId,
      entityType: 'workflow',
      entityId: workflowId,
      action: 'restore',
      details: {
        fromVersionId,
        toVersionId: restoredVersion.id,
        notes,
      },
    });
    logger.info({ workflowId, fromVersionId, toVersionId: restoredVersion.id, userId }, "Restored to version");
    return restoredVersion;
  }
  /**
   * Pin a specific version (overrides currentVersionId for API/Intake)
   */
  async pinVersion(
    workflowId: string,
    versionId: string,
    userId: string
  ): Promise<void> {
    const hasAccess = await aclService.hasWorkflowRole(userId, workflowId, 'edit');
    if (!hasAccess) {
      throw new Error(WORKFLOW_ACCESS_DENIED_MSG);
    }

    // Verify version exists and belongs to workflow
    const version = await this.getVersion(versionId);
    if (!version || version.workflowId !== workflowId) {
      throw new Error("Version not found or does not belong to this workflow");
    }
    // Update workflow's pinnedVersionId
    await db
      .update(schema.workflows)
      .set({
        pinnedVersionId: versionId,
        updatedAt: new Date(),
      })
      .where(eq(schema.workflows.id, workflowId));
    // Log audit event
    await db.insert(schema.auditLogs).values({
      userId: userId,
      entityType: 'workflow',
      entityId: workflowId,
      action: 'pin_version',
      details: { versionId },
    });
    logger.info({ workflowId, versionId, userId }, "Pinned version");
  }
  /**
   * Unpin version (removes pinnedVersionId)
   */
  async unpinVersion(workflowId: string, userId: string): Promise<void> {
    const hasAccess = await aclService.hasWorkflowRole(userId, workflowId, 'edit');
    if (!hasAccess) {
      throw new Error(WORKFLOW_ACCESS_DENIED_MSG);
    }

    await db
      .update(schema.workflows)
      .set({
        pinnedVersionId: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.workflows.id, workflowId));
    // Log audit event
    await db.insert(schema.auditLogs).values({
      userId: userId,
      entityType: 'workflow',
      entityId: workflowId,
      action: 'unpin_version',
      details: {},
    });
    logger.info({ workflowId, userId }, "Unpinned version");
  }
  /**
   * Compute diff between two versions
   */
  async diffVersions(versionId1: string, versionId2: string, userId: string): Promise<WorkflowDiff> {
    const version1 = await this.getVersion(versionId1);
    const version2 = await this.getVersion(versionId2);
    if (!version1 || !version2) {
      throw new Error("One or both versions not found");
    }

    const hasAccess1 = await aclService.hasWorkflowRole(userId, version1.workflowId, 'view');
    if (!hasAccess1) {
      throw new Error("Access denied - insufficient permissions for version 1's workflow");
    }

    const hasAccess2 = await aclService.hasWorkflowRole(userId, version2.workflowId, 'view');
    if (!hasAccess2) {
      throw new Error("Access denied - insufficient permissions for version 2's workflow");
    }

    return workflowDiffService.diff(version1.graphJson as WorkflowJSON, version2.graphJson as WorkflowJSON);
  }
  /**
   * Export workflow versions as JSON
   */
  async exportVersions(workflowId: string, userId: string): Promise<Record<string, unknown>> {
    const hasAccess = await aclService.hasWorkflowRole(userId, workflowId, 'view');
    if (!hasAccess) {
      throw new Error(WORKFLOW_ACCESS_DENIED_MSG);
    }

    const versions = await this.listVersions(workflowId);
    return {
      workflowId,
      exportedAt: new Date().toISOString(),
      versions: versions.map(v => ({
        id: v.id,
        graphJson: v.graphJson,
        notes: v.notes,
        changelog: v.changelog,
        checksum: v.checksum,
        published: v.published,
        publishedAt: v.publishedAt,
        createdAt: v.createdAt,
      })),
    };
  }
  /**
   * Update AI metadata for a version
   */
  async updateAiMetadata(versionId: string, metadata: Record<string, unknown>): Promise<void> {
    await db
      .update(schema.workflowVersions)
      .set({
        migrationInfo: { aiMetadata: metadata }
      })
      .where(eq(schema.workflowVersions.id, versionId));
  }
}
export const versionService = new VersionService();
