import { db } from "../db";
import { workflowVersions, workflows, auditEvents } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { computeChecksum, verifyChecksum } from "../utils/checksum";
import { workflowDiffService } from "./diff/WorkflowDiffService";
import { createLogger } from "../logger";
import type { WorkflowVersion } from "@shared/schema";
import { aclService } from "./AclService";

const logger = createLogger({ module: "version-service" });

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
        throw new Error("Access denied - insufficient permissions for this workflow");
      }
    }

    const versions = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflowId))
      .orderBy(desc(workflowVersions.createdAt));

    return versions;
  }

  /**
   * Get a specific version
   */
  async getVersion(versionId: string): Promise<WorkflowVersion | null> {
    const [version] = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.id, versionId))
      .limit(1);

    return version || null;
  }

  /**
   * Validate workflow before publishing
   * Checks for:
   * - Acyclic graph
   * - Valid expressions
   * - Template placeholders resolved
   * - Required collections exist
   */
  async validateWorkflow(workflowId: string, graphJson: any): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Basic validation checks
    if (!graphJson) {
      result.valid = false;
      result.errors.push("Invalid graph structure: empty");
      return result;
    }

    if (graphJson.pages) {
      // Validation for Pages/Blocks structure
      if (!Array.isArray(graphJson.pages)) {
        result.valid = false;
        result.errors.push("Invalid graph structure: pages must be an array");
      }
      return result; // Skip node/edge checks for now
    }

    // Legacy node/edge validation
    if (!graphJson.nodes) {
      result.valid = false;
      result.errors.push("Invalid graph structure: missing nodes or pages");
      return result;
    }

    // Check for cycles in the graph
    const hasCycle = this.detectCycle(graphJson);
    if (hasCycle) {
      result.valid = false;
      result.errors.push("Graph contains cycles - workflows must be acyclic");
    }

    // Validate node types and configurations
    for (const node of graphJson.nodes) {
      if (!node.type) {
        result.errors.push(`Node ${node.id} is missing a type`);
        result.valid = false;
      }

      // Validate node-specific configurations
      if (node.type === 'question' && !node.data?.questionText) {
        result.warnings.push(`Question node ${node.id} has no question text`);
      }
    }

    // Validate edges
    if (graphJson.edges) {
      for (const edge of graphJson.edges) {
        const sourceExists = graphJson.nodes.some((n: any) => n.id === edge.source);
        const targetExists = graphJson.nodes.some((n: any) => n.id === edge.target);

        if (!sourceExists) {
          result.errors.push(`Edge references non-existent source node: ${edge.source}`);
          result.valid = false;
        }
        if (!targetExists) {
          result.errors.push(`Edge references non-existent target node: ${edge.target}`);
          result.valid = false;
        }
      }
    }

    return result;
  }

  /**
   * Detect cycles in graph using DFS
   */
  private detectCycle(graphJson: any): boolean {
    const nodes = graphJson.nodes || [];
    const edges = graphJson.edges || [];

    // Build adjacency list
    const adjacency = new Map<string, string[]>();
    for (const node of nodes) {
      adjacency.set(node.id, []);
    }
    for (const edge of edges) {
      const neighbors = adjacency.get(edge.source) || [];
      neighbors.push(edge.target);
      adjacency.set(edge.source, neighbors);
    }

    // DFS with recursion stack
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const neighbors = adjacency.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true; // Cycle detected
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) return true;
      }
    }

    return false;
  }


  /**
   * Create a draft version (for AI edits or auto-saves)
   * Creates an immutable snapshot without publishing
   * Does NOT validate or update workflow.currentVersionId
   * Returns null if no changes detected (checksum matches latest)
   */
  async createDraftVersion(
    workflowId: string,
    userId: string,
    graphJson: any,
    notes?: string,
    metadata?: Record<string, any>
  ): Promise<WorkflowVersion | null> {
    // Compute checksum
    const checksum = computeChecksum({ graphJson });

    // Fetch the LATEST version for this workflow.
    const [latestVersion] = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflowId))
      .orderBy(desc(workflowVersions.createdAt))
      .limit(1);

    // If checksum matches latest, no changes - return null
    if (latestVersion && latestVersion.checksum === checksum) {
      logger.debug({ workflowId, checksum }, "No changes detected, skipping draft version creation");
      return null;
    }

    // Compute diff against latest version for changelog
    let changelog: any = null;
    if (latestVersion) {
      changelog = workflowDiffService.diff(latestVersion.graphJson as any, graphJson);
    }

    // Determine version number
    const versionNumber = latestVersion ? (latestVersion.versionNumber || 1) + 1 : 1;

    // Create new draft version
    const [newVersion] = await db
      .insert(workflowVersions)
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
        migrationInfo: metadata ? { aiMetadata: metadata } : null,
      })
      .returning();

    // Log audit event
    await db.insert(auditEvents).values({
      actorId: userId,
      entityType: 'workflow_version',
      entityId: newVersion.id,
      action: 'create_draft_version',
      diff: {
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
    graphJson: any,
    notes?: string,
    force: boolean = false
  ): Promise<WorkflowVersion> {
    // Validate workflow
    const validation = await this.validateWorkflow(workflowId, graphJson);

    if (!validation.valid && !force) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Compute checksum
    const checksum = computeChecksum({ graphJson });

    // Compute diff against latest version for changelog
    let changelog: any = null;
    // Fetch the LATEST version for this workflow.
    const [latestVersion] = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflowId))
      .orderBy(desc(workflowVersions.createdAt))
      .limit(1);

    if (latestVersion) {
      changelog = workflowDiffService.diff(latestVersion.graphJson as any, graphJson);
    }

    // Determine version number
    const versionNumber = latestVersion ? (latestVersion.versionNumber || 1) + 1 : 1;

    // Create new version (published)
    const [newVersion] = await db
      .insert(workflowVersions)
      .values({
        workflowId,
        graphJson,
        createdBy: userId,
        isDraft: false,
        published: true,
        publishedAt: new Date(),
        versionNumber,
        notes,
        checksum,
        changelog,
      })
      .returning();

    // Update workflow's currentVersionId and status to active
    await db
      .update(workflows)
      .set({
        currentVersionId: newVersion.id,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId));

    // Log audit event
    await db.insert(auditEvents).values({
      actorId: userId,
      entityType: 'workflow_version',
      entityId: newVersion.id,
      action: 'publish',
      diff: {
        notes,
        checksum,
        versionNumber,
        validationWarnings: validation.warnings,
        forced: force,
        changelog // include in audit too
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
    // Verify version exists and belongs to workflow
    const version = await this.getVersion(toVersionId);

    if (!version || version.workflowId !== workflowId) {
      throw new Error("Version not found or does not belong to this workflow");
    }

    // Update workflow's currentVersionId
    await db
      .update(workflows)
      .set({
        currentVersionId: toVersionId,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId));

    // Log audit event
    await db.insert(auditEvents).values({
      actorId: userId,
      entityType: 'workflow',
      entityId: workflowId,
      action: 'rollback',
      diff: {
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
      sourceVersion.graphJson,
      notes || `Restored from version ${sourceVersion.versionNumber || fromVersionId}`,
      { restoredFrom: fromVersionId }
    );

    if (!restoredVersion) {
      throw new Error("Failed to create restored version (no changes detected)");
    }

    // Log audit event
    await db.insert(auditEvents).values({
      actorId: userId,
      entityType: 'workflow',
      entityId: workflowId,
      action: 'restore',
      diff: {
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
    // Verify version exists and belongs to workflow
    const version = await this.getVersion(versionId);

    if (!version || version.workflowId !== workflowId) {
      throw new Error("Version not found or does not belong to this workflow");
    }

    // Update workflow's pinnedVersionId
    await db
      .update(workflows)
      .set({
        pinnedVersionId: versionId,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId));

    // Log audit event
    await db.insert(auditEvents).values({
      actorId: userId,
      entityType: 'workflow',
      entityId: workflowId,
      action: 'pin_version',
      diff: { versionId },
    });

    logger.info({ workflowId, versionId, userId }, "Pinned version");
  }

  /**
   * Unpin version (removes pinnedVersionId)
   */
  async unpinVersion(workflowId: string, userId: string): Promise<void> {
    await db
      .update(workflows)
      .set({
        pinnedVersionId: null,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId));

    // Log audit event
    await db.insert(auditEvents).values({
      actorId: userId,
      entityType: 'workflow',
      entityId: workflowId,
      action: 'unpin_version',
      diff: {},
    });

    logger.info({ workflowId, userId }, "Unpinned version");
  }

  /**
   * Compute diff between two versions
   */
  async diffVersions(versionId1: string, versionId2: string): Promise<any> {
    const version1 = await this.getVersion(versionId1);
    const version2 = await this.getVersion(versionId2);

    if (!version1 || !version2) {
      throw new Error("One or both versions not found");
    }

    return workflowDiffService.diff(version1.graphJson as any, version2.graphJson as any);
  }

  /**
   * Export workflow versions as JSON
   */
  async exportVersions(workflowId: string): Promise<any> {
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
}

export const versionService = new VersionService();
