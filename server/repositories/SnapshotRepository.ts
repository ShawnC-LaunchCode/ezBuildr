import { eq, and, desc } from "drizzle-orm";

import { workflowSnapshots } from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

export type WorkflowSnapshot = typeof workflowSnapshots.$inferSelect;
export type InsertWorkflowSnapshot = typeof workflowSnapshots.$inferInsert;

export type SnapshotValueMap = {
  [stepKey: string]: {
    value: any;
    stepId: string;
    stepUpdatedAt: string;
  };
};

/**
 * Repository for workflow snapshot data access
 */
export class SnapshotRepository extends BaseRepository<
  typeof workflowSnapshots,
  WorkflowSnapshot,
  InsertWorkflowSnapshot
> {
  constructor(dbInstance?: typeof db) {
    super(workflowSnapshots, dbInstance);
  }

  /**
   * Find all snapshots for a workflow, ordered by creation date (newest first)
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<WorkflowSnapshot[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(workflowSnapshots)
      .where(eq(workflowSnapshots.workflowId, workflowId))
      .orderBy(desc(workflowSnapshots.createdAt));
  }

  /**
   * Find a snapshot by workflow ID and name
   */
  async findByWorkflowIdAndName(
    workflowId: string,
    name: string,
    tx?: DbTransaction
  ): Promise<WorkflowSnapshot | null> {
    const database = this.getDb(tx);
    const [snapshot] = await database
      .select()
      .from(workflowSnapshots)
      .where(and(eq(workflowSnapshots.workflowId, workflowId), eq(workflowSnapshots.name, name)))
      .limit(1);
    return snapshot || null;
  }

  /**
   * Update snapshot values (for save-from-run operation)
   */
  async updateValues(
    snapshotId: string,
    values: Record<string, any>,
    versionHash?: string,
    tx?: DbTransaction
  ): Promise<WorkflowSnapshot | null> {
    // Validate inputs
    if (!snapshotId || typeof snapshotId !== 'string') {
      throw new Error('Invalid snapshotId: must be a non-empty string');
    }
    if (!values || typeof values !== 'object') {
      throw new Error('Invalid values: must be an object');
    }

    const database = this.getDb(tx);
    const updateData: Partial<WorkflowSnapshot> = {
      values: values,
      updatedAt: new Date(),
    };

    // Only set versionHash if it's a non-empty string
    if (versionHash && versionHash.trim().length > 0) {
      updateData.versionHash = versionHash;
    }

    const [updated] = await database
      .update(workflowSnapshots)
      .set(updateData)
      .where(eq(workflowSnapshots.id, snapshotId))
      .returning();
    return updated || null;
  }

  /**
   * Update snapshot name (for rename operation)
   */
  async updateName(
    snapshotId: string,
    name: string,
    tx?: DbTransaction
  ): Promise<WorkflowSnapshot | null> {
    // Validate inputs
    if (!snapshotId || typeof snapshotId !== 'string') {
      throw new Error('Invalid snapshotId: must be a non-empty string');
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Invalid name: must be a non-empty string');
    }

    const database = this.getDb(tx);
    const [updated] = await database
      .update(workflowSnapshots)
      .set({
        name: name.trim(),
        updatedAt: new Date(),
      })
      .where(eq(workflowSnapshots.id, snapshotId))
      .returning();
    return updated || null;
  }
}

// Singleton instance
export const snapshotRepository = new SnapshotRepository();
