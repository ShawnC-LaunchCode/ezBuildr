import { eq, desc } from "drizzle-orm";
import { z } from "zod";

import { CURRENT_VERSION_ID } from "@shared/config";
import * as schema from "@shared/schema";
import type { WorkflowVersion } from "@shared/schema";
import type { WorkflowJSON } from "@shared/types/workflow";

import { WorkflowGraphSchema } from "../../shared/zod-schemas.js";
import { db } from "../db";
import { createLogger } from "../logger";
import { computeChecksum } from "../utils/checksum";
import { createError } from "../utils/errors";
import { documentTemplateRepository } from "../repositories";
import {
  lintWorkflowContent,
  type LintableWorkflowContent,
  type LintResult,
} from "./workflowLintRules";
import {
  validateWorkflowStructure,
  type WorkflowReadinessContext,
} from "./workflowStructureRules";

import { aclService } from "./AclService";
// Imported from the provider module directly, not the `./esign` barrel: the
// barrel pulls in DocusignProvider and runs registration side effects, which a
// read-only availability check must not depend on.
import { EsignProviderFactory } from "./esign/EsignProvider";
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

function collectLintResults(
  content: LintableWorkflowContent,
  readiness: WorkflowReadinessContext
): LintResult[] {
  const combined = [
    ...lintWorkflowContent(content),
    ...validateWorkflowStructure(content, readiness),
  ];
  const seen = new Set<string>();
  return combined.filter((result) => {
    const key = `${result.type}|${result.message}`;
    if (seen.has(key)) { return false; }
    seen.add(key);
    return true;
  });
}

function summarizeLintResults(results: LintResult[]): ValidationResult {
  const errors = results.filter(result => result.type === "error").map(result => result.message);
  const warnings = results.filter(result => result.type === "warning").map(result => result.message);
  return { valid: errors.length === 0, errors, warnings };
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
   * Fetch the most recently created version (draft or published) for a
   * workflow, or null if none exists yet. RVP-6 uses this when
   * `createDraftVersion` returns null (checksum matches the latest version,
   * i.e. nothing changed) to pin a run to the version that already exists
   * instead of treating "no changes" as a failure.
   */
  async getLatestVersion(workflowId: string): Promise<WorkflowVersion | null> {
    const [latestVersion] = await db
      .select()
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.workflowId, workflowId))
      .orderBy(desc(schema.workflowVersions.createdAt))
      .limit(1);
    return latestVersion ?? null;
  }
  /**
   * Validate workflow before publishing
   * Checks for:
   * - Acyclic graph
   * - Valid expressions
   * - Template placeholders resolved
   * - Required collections exist
   */
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
          defaultValue: step.defaultValue ?? undefined,
          isVirtual: step.isVirtual,
        })),
      })),
      // LU-6a: the rule's trigger condition is `when` (a ConditionExpression),
      // not the old flat operator/conditionValue/logicalOperator trio.
      // `conditionStepId`/`conditionStepAlias` are kept as advisory
      // bookkeeping (lint's "does this rule reference a real step" check),
      // not as the source of truth for evaluation.
      logicRules: fullData.logicRules.map(rule => ({
        id: rule.id,
        conditionStepId: rule.conditionStepId ?? undefined,
        conditionStepAlias: rule.conditionStepId ? (stepIdToAlias.get(rule.conditionStepId) ?? rule.conditionStepId) : '',
        when: rule.when ?? null,
        targetType: rule.targetType,
        targetId: rule.targetType === 'section' ? (rule.targetSectionId ?? undefined) : (rule.targetStepId ?? undefined),
        targetAlias: (rule.targetType === 'section' && rule.targetSectionId) ? (sectionIdToAlias.get(rule.targetSectionId) ?? rule.targetSectionId) : (rule.targetStepId ? (stepIdToAlias.get(rule.targetStepId) ?? rule.targetStepId) : ''),
        action: rule.action,
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

  /**
   * Structural + reference validation run before a workflow can go live.
   *
   * Both doors into 'active' funnel through `publishVersion` (WorkflowService
   * .changeStatus calls it too), so this is the single gate. It combines the
   * reference linter (`lintWorkflowContent` — unknown aliases, orphaned input
   * keys) with the structural rules (`validateWorkflowStructure` — empty
   * workflows, non-UUID ids, unknown or unanswerable step types, unresolvable
   * and backwards-skipping logic rules, optionless choice questions).
   *
   * Errors block the publish; warnings are recorded on the audit entry. Both
   * rule sets can independently report the same condition (e.g. "no
   * questions"), so messages are de-duplicated.
   *
   * `readiness` supplies the facts the pure rules cannot look up (existing
   * template ids, registered e-sign providers) — see `buildReadinessContext`.
   * It defaults to empty so the structural rules that need no I/O still run for
   * any caller that omits it.
   */
  validateWorkflow(
    _workflowId: string,
    graphJson: WorkflowGraph,
    readiness: WorkflowReadinessContext = {}
  ): ValidationResult {
    const content = graphJson as unknown as LintableWorkflowContent;
    return summarizeLintResults(collectLintResults(content, readiness));
  }

  /** Return the exact categorized findings used by the publish gate. */
  async lintSerializedWorkflow(content: LintableWorkflowContent): Promise<LintResult[]> {
    const readiness = await this.buildReadinessContext(content);
    return collectLintResults(content, readiness);
  }

  /**
   * Resolve the publish-time facts the pure rule modules cannot look up
   * themselves (GH-152).
   *
   * Kept here rather than inside the rules so those stay pure and synchronous:
   * this is one indexed query plus an in-memory registry read, and the graph
   * already carries `projectId`, so no extra workflow fetch is needed.
   *
   * Template ids are scoped by project on purpose — it mirrors exactly what
   * `RunLifecycleService` does at generation time
   * (`documentTemplateRepository.findByIdAndProjectId(documentId, projectId)`),
   * so a workflow that clears this gate resolves the same templates at run time.
   */
  private async buildReadinessContext(graphJson: LintableWorkflowContent): Promise<WorkflowReadinessContext> {
    const projectId = (graphJson as LintableWorkflowContent & { projectId?: string | null }).projectId;

    let knownTemplateIds: Set<string> | undefined;
    if (typeof projectId === "string" && projectId.length > 0) {
      const templates = await documentTemplateRepository.findByProjectId(projectId);
      knownTemplateIds = new Set(templates.map(template => template.id));
    }

    return {
      knownTemplateIds,
      availableEsignProviders: new Set(
        EsignProviderFactory.getAllProviders().map(name => name.toLowerCase())
      ),
    };
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
    // Authorization first: never do the serialization work before establishing
    // the caller may publish (RUN2-7).
    const hasAccess = await aclService.hasWorkflowRole(userId, workflowId, 'edit');
    if (!hasAccess) {
      throw new Error(WORKFLOW_ACCESS_DENIED_MSG);
    }

    const graphJson = await this.serializeWorkflow(workflowId, userId) as unknown as WorkflowGraph;

    // RUN2-7 / RUN2-9: publishing sets status to 'active' further down, exactly
    // like PUT /api/workflows/:id/status does — so it must clear the validation
    // gate. Previously only the status route ran the linter (and the structural
    // validator was a stub returning `{ valid: true }`), leaving publish — the
    // door the builder actually uses — completely ungated.
    //
    // GH-152: the gate also refuses documents whose templates do not resolve,
    // which needs the project's template ids — resolved here so the rules stay pure.
    const lintResults = await this.lintSerializedWorkflow(graphJson as unknown as LintableWorkflowContent);
    const validation = summarizeLintResults(lintResults);
    if (!validation.valid && !force) {
      throw createError.validation(
        `Cannot publish workflow: ${validation.errors.join(', ')}`
      );
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
        // RUN2-7: when a publish is forced past a failing gate, record exactly
        // what was overridden — a forced publish must be auditable.
        lintErrorsOverridden: validation.errors.length > 0 ? validation.errors : undefined,
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
    if (!version1) {
      throw new Error("Version 1 not found");
    }

    const hasAccess1 = await aclService.hasWorkflowRole(userId, version1.workflowId, 'view');
    if (!hasAccess1) {
      throw new Error("Access denied - insufficient permissions for version 1's workflow");
    }

    let graphJson2: WorkflowJSON;

    if (versionId2 === CURRENT_VERSION_ID) {
      // The live state of version 1's own workflow — already authorized above.
      // Serialized the same way stored graphJson is written, so the two sides
      // of the diff have identical shape.
      const liveGraph = await this.serializeWorkflow(version1.workflowId, userId);
      graphJson2 = liveGraph as unknown as WorkflowJSON;
    } else {
      const version2 = await this.getVersion(versionId2);
      if (!version2) {
        throw new Error("Version 2 not found");
      }
      const hasAccess2 = await aclService.hasWorkflowRole(userId, version2.workflowId, 'view');
      if (!hasAccess2) {
        throw new Error("Access denied - insufficient permissions for version 2's workflow");
      }
      graphJson2 = version2.graphJson as WorkflowJSON;
    }

    return workflowDiffService.diff(version1.graphJson as WorkflowJSON, graphJson2);
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
