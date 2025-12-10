import {
  snapshotRepository,
  stepValueRepository,
  stepRepository,
  workflowRepository,
  type WorkflowSnapshot,
  type SnapshotValueMap,
} from "../repositories";
import { logger } from "../logger";
import { generateWorkflowVersionHash, isVersionHashMatch } from "../utils/workflowVersionHash";
import { findMissingValues, normalizeSnapshotValues, type MissingValue } from "../utils/snapshotHelpers";

/**
 * Service layer for workflow snapshot-related business logic
 */
export class SnapshotService {
  private snapshotRepo: typeof snapshotRepository;
  private stepValueRepo: typeof stepValueRepository;
  private stepRepo: typeof stepRepository;
  private workflowRepo: typeof workflowRepository;

  constructor(
    snapshotRepo?: typeof snapshotRepository,
    stepValueRepo?: typeof stepValueRepository,
    stepRepo?: typeof stepRepository,
    workflowRepo?: typeof workflowRepository
  ) {
    this.snapshotRepo = snapshotRepo || snapshotRepository;
    this.stepValueRepo = stepValueRepo || stepValueRepository;
    this.stepRepo = stepRepo || stepRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
  }

  /**
   * Get all snapshots for a workflow
   */
  async getSnapshotsByWorkflowId(workflowId: string): Promise<WorkflowSnapshot[]> {
    return await this.snapshotRepo.findByWorkflowId(workflowId);
  }

  /**
   * Get a single snapshot by ID
   */
  async getSnapshotById(snapshotId: string): Promise<WorkflowSnapshot | null> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);
    return snapshot || null;
  }

  /**
   * Create a new snapshot (empty values)
   */
  async createSnapshot(workflowId: string, name: string): Promise<WorkflowSnapshot> {
    // Check if workflow exists
    const workflow = await this.workflowRepo.findById(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Check if snapshot with same name already exists
    const existing = await this.snapshotRepo.findByWorkflowIdAndName(workflowId, name);
    if (existing) {
      throw new Error(`Snapshot with name "${name}" already exists for this workflow`);
    }

    // Get all workflow steps to generate version hash
    const allSteps = await this.stepRepo.findByWorkflowId(workflowId);
    const versionHash = generateWorkflowVersionHash(allSteps);

    // Create snapshot with empty values and version hash
    const snapshot = await this.snapshotRepo.create({
      workflowId,
      name,
      values: {},
      versionHash,
    });

    if (!snapshot) {
      throw new Error("Failed to create snapshot");
    }

    logger.info({ workflowId, snapshotId: snapshot.id, name, versionHash }, "Created snapshot");
    return snapshot;
  }

  /**
   * Rename a snapshot
   */
  async renameSnapshot(snapshotId: string, newName: string): Promise<WorkflowSnapshot> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    // Check if another snapshot with the same name already exists for this workflow
    const existing = await this.snapshotRepo.findByWorkflowIdAndName(snapshot.workflowId, newName);
    if (existing && existing.id !== snapshotId) {
      throw new Error(`Snapshot with name "${newName}" already exists for this workflow`);
    }

    const updated = await this.snapshotRepo.updateName(snapshotId, newName);
    if (!updated) {
      throw new Error("Failed to rename snapshot");
    }

    logger.info({ snapshotId, newName }, "Renamed snapshot");
    return updated;
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    await this.snapshotRepo.delete(snapshotId);
    logger.info({ snapshotId }, "Deleted snapshot");
  }

  /**
   * Save current run values to a snapshot
   * Stores simple key-value pairs (alias -> value) and updates version hash
   */
  async saveFromRun(snapshotId: string, runId: string): Promise<WorkflowSnapshot> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    // Get all step values for the run
    const runValues = await this.stepValueRepo.findByRunId(runId);

    // Build the snapshot value map (simple format: alias -> value)
    const valueMap: Record<string, any> = {};

    for (const runValue of runValues) {
      // Get step details
      const step = await this.stepRepo.findById(runValue.stepId);
      if (!step) {
        logger.warn({ stepId: runValue.stepId }, "Step not found for run value, skipping");
        continue;
      }

      // Use step alias as key if available, otherwise use stepId
      const key = step.alias || step.id;

      // Store value directly (no wrapper)
      valueMap[key] = runValue.value;
    }

    // Get all workflow steps to regenerate version hash
    const allSteps = await this.stepRepo.findByWorkflowId(snapshot.workflowId);
    const versionHash = generateWorkflowVersionHash(allSteps);

    // Update snapshot with new values and version hash
    const updated = await this.snapshotRepo.updateValues(snapshotId, valueMap, versionHash);
    if (!updated) {
      throw new Error("Failed to update snapshot values");
    }

    logger.info({ snapshotId, runId, valueCount: Object.keys(valueMap).length, versionHash }, "Saved run values to snapshot");
    return updated;
  }

  /**
   * Get snapshot values as a simple key-value map
   * Useful for populating run initial values
   *
   * TODO: Add concurrency control for snapshot access
   * Currently, multiple concurrent reads could cause race conditions if the snapshot
   * is being updated simultaneously. Consider adding:
   * - Row-level locking with FOR SHARE clause
   * - Optimistic concurrency control with version field
   * - Read-through cache with TTL
   */
  async getSnapshotValues(snapshotId: string): Promise<Record<string, any>> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    // Normalize values (handles both old and new format)
    const values = normalizeSnapshotValues(snapshot.values);
    return values;
  }

  /**
   * Check if a snapshot's values are still valid for the current workflow
   * Returns validation details including missing values and hash status
   */
  async validateSnapshot(snapshotId: string): Promise<{
    isValid: boolean;
    missingValues: MissingValue[];
    outdatedHash: boolean;
    currentHash: string;
  }> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    // Get all current workflow steps
    const allSteps = await this.stepRepo.findByWorkflowId(snapshot.workflowId);
    const currentHash = generateWorkflowVersionHash(allSteps);

    // Check if version hash matches
    const outdatedHash = !isVersionHashMatch(snapshot.versionHash || null, currentHash);

    // Normalize snapshot values
    const normalizedValues = normalizeSnapshotValues(snapshot.values);

    // Find missing values
    const missingValues = findMissingValues(normalizedValues, allSteps);

    return {
      isValid: !outdatedHash && missingValues.length === 0,
      missingValues,
      outdatedHash,
      currentHash,
    };
  }
}

// Singleton instance
export const snapshotService = new SnapshotService();
