import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { workflowSnapshots } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";

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
    return await database
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
    values: SnapshotValueMap,
    tx?: DbTransaction
  ): Promise<WorkflowSnapshot | null> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(workflowSnapshots)
      .set({
        values: values as any,
        updatedAt: new Date(),
      })
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
    const database = this.getDb(tx);
    const [updated] = await database
      .update(workflowSnapshots)
      .set({
        name,
        updatedAt: new Date(),
      })
      .where(eq(workflowSnapshots.id, snapshotId))
      .returning();
    return updated || null;
  }
}

// Singleton instance
export const snapshotRepository = new SnapshotRepository();
