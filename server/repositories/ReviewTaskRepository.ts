import { eq, and, desc } from "drizzle-orm";

import { reviewTasks, type ReviewTask, type InsertReviewTask } from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for review task data access
 * Stage 14: E-Signature Node + Document Review Portal
 */
export class ReviewTaskRepository extends BaseRepository<
  typeof reviewTasks,
  ReviewTask,
  InsertReviewTask
> {
  constructor(dbInstance?: typeof db) {
    super(reviewTasks, dbInstance);
  }

  /**
   * Find review tasks by run ID
   */
  async findByRunId(runId: string, tx?: DbTransaction): Promise<ReviewTask[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(reviewTasks)
      .where(eq(reviewTasks.runId, runId))
      .orderBy(desc(reviewTasks.createdAt));
  }

  /**
   * Find review tasks by workflow ID
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<ReviewTask[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(reviewTasks)
      .where(eq(reviewTasks.workflowId, workflowId))
      .orderBy(desc(reviewTasks.createdAt));
  }

  /**
   * Find review tasks by reviewer ID
   */
  async findByReviewerId(reviewerId: string, tx?: DbTransaction): Promise<ReviewTask[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(reviewTasks)
      .where(eq(reviewTasks.reviewerId, reviewerId))
      .orderBy(desc(reviewTasks.createdAt));
  }

  /**
   * Find pending review tasks by project ID
   */
  async findPendingByProjectId(projectId: string, tx?: DbTransaction): Promise<ReviewTask[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(reviewTasks)
      .where(
        and(
          eq(reviewTasks.projectId, projectId),
          eq(reviewTasks.status, 'pending')
        )
      )
      .orderBy(desc(reviewTasks.createdAt));
  }

  /**
   * Find review task by run ID and node ID
   */
  async findByRunAndNode(
    runId: string,
    nodeId: string,
    tx?: DbTransaction
  ): Promise<ReviewTask | null> {
    const database = this.getDb(tx);
    const [task] = await database
      .select()
      .from(reviewTasks)
      .where(
        and(
          eq(reviewTasks.runId, runId),
          eq(reviewTasks.nodeId, nodeId)
        )
      )
      .limit(1);
    return task || null;
  }

  /**
   * Update review task status
   */
  async updateStatus(
    taskId: string,
    status: 'approved' | 'changes_requested' | 'rejected',
    comment?: string,
    tx?: DbTransaction
  ): Promise<ReviewTask> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(reviewTasks)
      .set({
        status,
        comment,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reviewTasks.id, taskId))
      .returning();
    return updated;
  }
}

// Singleton instance
export const reviewTaskRepository = new ReviewTaskRepository();
