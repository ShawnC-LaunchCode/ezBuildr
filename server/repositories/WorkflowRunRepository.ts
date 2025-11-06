import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { workflowRuns, type WorkflowRun, type InsertWorkflowRun } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";

/**
 * Repository for workflow run data access
 */
export class WorkflowRunRepository extends BaseRepository<
  typeof workflowRuns,
  WorkflowRun,
  InsertWorkflowRun
> {
  constructor(dbInstance?: typeof db) {
    super(workflowRuns, dbInstance);
  }

  /**
   * Find runs by workflow ID
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<WorkflowRun[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
      .orderBy(desc(workflowRuns.createdAt));
  }

  /**
   * Find completed runs by workflow ID
   */
  async findCompletedByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<WorkflowRun[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.workflowId, workflowId), eq(workflowRuns.completed, true)))
      .orderBy(desc(workflowRuns.completedAt));
  }

  /**
   * Mark run as complete
   */
  async markComplete(runId: string, tx?: DbTransaction): Promise<WorkflowRun> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(workflowRuns)
      .set({
        completed: true,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, runId))
      .returning();
    return updated;
  }
}

// Singleton instance
export const workflowRunRepository = new WorkflowRunRepository();
