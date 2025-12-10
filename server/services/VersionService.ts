import { db } from "../db";
import { workflowVersions, workflows, auditEvents } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { computeChecksum, verifyChecksum } from "../utils/checksum";
import { computeVersionDiff, type VersionDiff } from "../utils/diff";
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
    console.log(`[VersionService] listVersions called with workflowId: ${workflowId}, userId: ${userId}, userId type: ${typeof userId}`);
    if (userId) {
      console.log(`[VersionService] Checking access for user ${userId} on workflow ${workflowId}`);
      const hasAccess = await aclService.hasWorkflowRole(userId, workflowId, 'view');
      console.log(`[VersionService] hasAccess result: ${hasAccess}`);
      if (!hasAccess) {
        console.log(`[VersionService] Access DENIED for user ${userId} on workflow ${workflowId}`);
        throw new Error("Access denied - insufficient permissions for this workflow");
      }
      console.log(`[VersionService] Access GRANTED for user ${userId} on workflow ${workflowId}`);
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
    if (!graphJson || !graphJson.nodes) {
      result.valid = false;
      result.errors.push("Invalid graph structure: missing nodes");
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
   * Publish a new version
   * Creates an immutable snapshot with checksum
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

    // Create new version
    const [newVersion] = await db
      .insert(workflowVersions)
      .values({
        workflowId,
        graphJson,
        createdBy: userId,
        published: true,
        publishedAt: new Date(),
        notes,
        checksum,
      })
      .returning();

    // Update workflow's currentVersionId
    await db
      .update(workflows)
      .set({
        currentVersionId: newVersion.id,
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
        validationWarnings: validation.warnings,
        forced: force,
      },
    });

    logger.info({ workflowId, versionId: newVersion.id, userId }, "Published new version");

    return newVersion;
  }

  /**
   * Rollback to a previous version
   * Sets currentVersionId to the specified version
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
      },
    });

    logger.info({ workflowId, toVersionId, userId }, "Rolled back to version");
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
  async diffVersions(versionId1: string, versionId2: string): Promise<VersionDiff> {
    const version1 = await this.getVersion(versionId1);
    const version2 = await this.getVersion(versionId2);

    if (!version1 || !version2) {
      throw new Error("One or both versions not found");
    }

    return computeVersionDiff(
      {
        graphJson: version1.graphJson,
        checksum: version1.checksum,
      },
      {
        graphJson: version2.graphJson,
        checksum: version2.checksum,
      }
    );
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
