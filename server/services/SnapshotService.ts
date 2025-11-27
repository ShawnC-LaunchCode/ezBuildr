import {
  snapshotRepository,
  stepValueRepository,
  stepRepository,
  workflowRepository,
  type WorkflowSnapshot,
  type SnapshotValueMap,
} from "../repositories";
import { logger } from "../logger";

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
    return await this.snapshotRepo.findById(snapshotId);
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

    // Create snapshot with empty values
    const snapshot = await this.snapshotRepo.create({
      workflowId,
      name,
      values: {},
    });

    if (!snapshot) {
      throw new Error("Failed to create snapshot");
    }

    logger.info({ workflowId, snapshotId: snapshot.id, name }, "Created snapshot");
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
   * Save current run values to a snapshot (versioned)
   * For each run value, stores { value, stepId, stepUpdatedAt }
   * This allows us to detect if a step has changed since the snapshot was saved
   */
  async saveFromRun(snapshotId: string, runId: string): Promise<WorkflowSnapshot> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    // Get all step values for the run
    const runValues = await this.stepValueRepo.findByRunId(runId);

    // Build the snapshot value map
    const valueMap: SnapshotValueMap = {};

    for (const runValue of runValues) {
      // Get step details
      const step = await this.stepRepo.findById(runValue.stepId);
      if (!step) {
        logger.warn({ stepId: runValue.stepId }, "Step not found for run value, skipping");
        continue;
      }

      // Use step alias as key if available, otherwise use stepId
      const key = step.alias || step.id;

      // Store versioned value
      valueMap[key] = {
        value: runValue.value,
        stepId: step.id,
        stepUpdatedAt: step.updatedAt?.toISOString() || new Date().toISOString(),
      };
    }

    // Update snapshot with new values
    const updated = await this.snapshotRepo.updateValues(snapshotId, valueMap);
    if (!updated) {
      throw new Error("Failed to update snapshot values");
    }

    logger.info({ snapshotId, runId, valueCount: Object.keys(valueMap).length }, "Saved run values to snapshot");
    return updated;
  }

  /**
   * Get snapshot values as a simple key-value map
   * Useful for populating run initial values
   */
  async getSnapshotValues(snapshotId: string): Promise<Record<string, any>> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    const values = snapshot.values as SnapshotValueMap;
    const result: Record<string, any> = {};

    for (const [key, data] of Object.entries(values)) {
      result[key] = data.value;
    }

    return result;
  }

  /**
   * Check if a snapshot's values are still valid for the current workflow
   * Returns { isValid: boolean, outdatedSteps: string[] }
   */
  async validateSnapshot(snapshotId: string): Promise<{ isValid: boolean; outdatedSteps: string[] }> {
    const snapshot = await this.snapshotRepo.findById(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    const values = snapshot.values as SnapshotValueMap;
    const outdatedSteps: string[] = [];

    for (const [key, data] of Object.entries(values)) {
      // Get current step details
      const step = await this.stepRepo.findById(data.stepId);

      if (!step) {
        // Step was deleted
        outdatedSteps.push(key);
        continue;
      }

      // Check if step was updated after snapshot value was saved
      const stepUpdatedAt = step.updatedAt?.toISOString() || new Date(0).toISOString();
      if (stepUpdatedAt > data.stepUpdatedAt) {
        outdatedSteps.push(key);
      }
    }

    return {
      isValid: outdatedSteps.length === 0,
      outdatedSteps,
    };
  }
}

// Singleton instance
export const snapshotService = new SnapshotService();
