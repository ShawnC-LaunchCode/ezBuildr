import { db } from "../db";
import { workflowSnapshots, workflowRuns, stepValues, steps } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import type { InferSelectModel } from 'drizzle-orm';

type Snapshot = InferSelectModel<typeof workflowSnapshots>;

export class SnapshotService {
  /**
   * Create a new snapshot
   */
  static async createSnapshot(workflowId: string, name: string): Promise<Snapshot> {
    const [snapshot] = await db
      .insert(workflowSnapshots)
      .values({
        workflowId,
        name,
        values: {}, // Start empty
      })
      .returning();
    return snapshot;
  }

  /**
   * Get all snapshots for a workflow
   */
  static async getSnapshotsByWorkflowId(workflowId: string): Promise<Snapshot[]> {
    return await db
      .select()
      .from(workflowSnapshots)
      .where(eq(workflowSnapshots.workflowId, workflowId))
      .orderBy(desc(workflowSnapshots.createdAt));
  }

  /**
   * Get a single snapshot
   */
  static async getSnapshotById(id: string): Promise<Snapshot | null> {
    const [snapshot] = await db
      .select()
      .from(workflowSnapshots)
      .where(eq(workflowSnapshots.id, id));
    return snapshot || null;
  }

  /**
   * Rename a snapshot
   */
  static async renameSnapshot(id: string, name: string): Promise<Snapshot> {
    const [snapshot] = await db
      .update(workflowSnapshots)
      .set({ name })
      .where(eq(workflowSnapshots.id, id))
      .returning();

    if (!snapshot) throw new Error(`Snapshot not found: ${id}`);
    return snapshot;
  }

  /**
   * Delete a snapshot
   */
  static async deleteSnapshot(id: string): Promise<void> {
    await db
      .delete(workflowSnapshots)
      .where(eq(workflowSnapshots.id, id));
  }

  /**
   * Save values from a run to a snapshot
   */
  static async saveFromRun(snapshotId: string, runId: string): Promise<Snapshot> {
    // 1. Verify run exists
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId));

    if (!run) throw new Error(`Run not found: ${runId}`);

    // 2. Fetch step values with step info
    const values = await db
      .select({
        value: stepValues.value,
        stepAlias: steps.alias,
        stepId: steps.id,
      })
      .from(stepValues)
      .innerJoin(steps, eq(stepValues.stepId, steps.id))
      .where(eq(stepValues.runId, runId));

    // 3. Construct input map (prefer alias, fallback to ID if needed)
    const inputMap: Record<string, any> = {};
    for (const v of values) {
      // Use alias if available, otherwise just ignore or use ID?
      // Requirement: "reference variable names"
      if (v.stepAlias) {
        inputMap[v.stepAlias] = v.value;
      }
    }

    // 4. Update snapshot
    const [snapshot] = await db
      .update(workflowSnapshots)
      .set({
        values: inputMap,
        updatedAt: new Date()
      })
      .where(eq(workflowSnapshots.id, snapshotId))
      .returning();

    if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);
    return snapshot;
  }

  /**
   * Get snapshot values as map
   */
  static async getSnapshotValues(snapshotId: string): Promise<Record<string, any>> {
    const snapshot = await this.getSnapshotById(snapshotId);
    if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);
    return (snapshot.values as Record<string, any>) || {};
  }

  /**
   * Validate snapshot against current workflow version
   * Returns warnings if variables are missing in current workflow
   */
  static async validateSnapshot(snapshotId: string): Promise<{ valid: boolean; warnings: string[] }> {
    const snapshot = await this.getSnapshotById(snapshotId);
    if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);

    const values = (snapshot.values as Record<string, any>) || {};
    const keys = Object.keys(values);
    if (keys.length === 0) return { valid: true, warnings: [] };

    // Find current steps for the workflow
    // This requires finding the workflow's current version (or just using latest steps if steps are shared across versions? No, steps are usually versioned or tied to section/workflow)
    // In this schema, `steps` are linked to `sections` linked to `workflow`.
    // We can fetch all steps for the workflow.

    // Note: Schema has `workflowId` on `sections`.
    const workflowSteps = await db
      .select({ alias: steps.alias })
      .from(steps)
      .innerJoin(sections, eq(steps.sectionId, sections.id))
      .where(
        and(
          eq(sections.workflowId, snapshot.workflowId),
          eq(steps.isVirtual, false) // Only care about user inputs usually
        )
      );

    const existingAliases = new Set(workflowSteps.map(s => s.alias).filter(Boolean));
    const warnings: string[] = [];

    for (const key of keys) {
      if (!existingAliases.has(key)) {
        warnings.push(`Variable '${key}' no longer exists in current workflow.`);
      }
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }
}

export const snapshotService = SnapshotService;
