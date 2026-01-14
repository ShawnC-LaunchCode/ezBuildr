import { eq, desc, and } from "drizzle-orm";

import { workflowSnapshots, workflowRuns, stepValues, steps, sections } from "@shared/schema";

import { db } from "../db";

import type { InferSelectModel } from 'drizzle-orm';

type Snapshot = InferSelectModel<typeof workflowSnapshots>;

export class SnapshotService {
  /**
   * Create a new snapshot
   */
  static async createSnapshot(workflowId: string, name: string, versionId?: string): Promise<Snapshot> {
    const [snapshot] = await db
      .insert(workflowSnapshots)
      .values({
        workflowId,
        name,
        values: {}, // Start empty
        workflowVersionId: versionId // Capture version if provided
      })
      .returning();
    return snapshot;
  }

  /**
   * Get all snapshots for a workflow
   */
  static async getSnapshotsByWorkflowId(workflowId: string): Promise<Snapshot[]> {
    return db
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

    if (!snapshot) {throw new Error(`Snapshot not found: ${id}`);}
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

    if (!run) {throw new Error(`Run not found: ${runId}`);}

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

    // 4. Update snapshot with values AND version from run
    const [snapshot] = await db
      .update(workflowSnapshots)
      .set({
        values: inputMap,
        workflowVersionId: run.workflowVersionId, // Lineage tracking
        updatedAt: new Date()
      })
      .where(eq(workflowSnapshots.id, snapshotId))
      .returning();

    if (!snapshot) {throw new Error(`Snapshot not found: ${snapshotId}`);}
    return snapshot;
  }

  /**
   * Get snapshot values as map
   */
  static async getSnapshotValues(snapshotId: string): Promise<Record<string, any>> {
    const snapshot = await this.getSnapshotById(snapshotId);
    if (!snapshot) {throw new Error(`Snapshot not found: ${snapshotId}`);}
    return (snapshot.values as Record<string, any>) || {};
  }

  /**
   * Validate snapshot against current workflow version
   * Returns compatibility report
   */
  static async validateSnapshot(snapshotId: string): Promise<{
    valid: boolean;
    severity: "safe" | "soft_breaking" | "hard_breaking";
    reasons: string[]
  }> {
    const snapshot = await this.getSnapshotById(snapshotId);
    if (!snapshot) {throw new Error(`Snapshot not found: ${snapshotId}`);}

    const values = (snapshot.values as Record<string, any>) || {};

    // Find current steps for the workflow
    const workflowSteps = await db
      .select({
        id: steps.id,
        alias: steps.alias,
        type: steps.type,
        required: steps.required,
        options: steps.options
      })
      .from(steps)
      .innerJoin(sections, eq(steps.sectionId, sections.id))
      .where(
        and(
          eq(sections.workflowId, snapshot.workflowId),
          eq(steps.isVirtual, false)
        )
      );

    const reasons: string[] = [];
    let severity: "safe" | "soft_breaking" | "hard_breaking" = "safe";

    // Build map for easy lookup
    const stepMap = new Map<string, typeof workflowSteps[0]>();
    for (const s of workflowSteps) {
      if (s.alias) {stepMap.set(s.alias, s);}
      stepMap.set(s.id, s); // Support ID lookup too
    }

    // 1. Check for Missing Required Fields (Soft Breaking)
    for (const step of workflowSteps) {
      if (step.required) {
        const hasValue = (step.alias && values[step.alias] !== undefined) || values[step.id] !== undefined;
        if (!hasValue) {
          severity = severity === "safe" ? "soft_breaking" : severity;
          reasons.push(`Missing required field: ${step.alias || step.id}`);
        }
      }
    }

    // 2. Check for Type Mismatches (Hard Breaking)
    for (const [key, value] of Object.entries(values)) {
      const step = stepMap.get(key);
      if (!step) {
        // Variable deleted - check if it was safe? 
        // Analyzer would handle this better, but here we assume if it's in snapshot 
        // and gone from workflow, it's just extra data (Safe).
        continue;
      }

      // Basic Type Checking
      let typeMismatch = false;
      switch (step.type) {
        case 'number':
        case 'currency':
          if (typeof value !== 'number') {typeMismatch = true;}
          break;
        case 'short_text':
        case 'long_text':
        case 'email':
          if (typeof value !== 'string') {typeMismatch = true;}
          break;
        case 'yes_no':
        case 'true_false':
          if (typeof value !== 'boolean' && value !== 'yes' && value !== 'no') {typeMismatch = true;}
          break;
        // Add more types as needed
      }

      if (typeMismatch) {
        severity = "hard_breaking";
        reasons.push(`Type mismatch for '${key}': Expected ${step.type}, got ${typeof value}`);
      }
    }

    return {
      valid: severity === "safe",
      severity,
      reasons
    };
  }
}

export const snapshotService = SnapshotService;
