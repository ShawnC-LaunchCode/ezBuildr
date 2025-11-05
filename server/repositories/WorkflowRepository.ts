import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { workflows, type Workflow, type InsertWorkflow } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";

/**
 * Repository for workflow data access
 */
export class WorkflowRepository extends BaseRepository<typeof workflows, Workflow, InsertWorkflow> {
  constructor(dbInstance?: typeof db) {
    super(workflows, dbInstance);
  }

  /**
   * Find workflows by creator ID
   */
  async findByCreatorId(creatorId: string, tx?: DbTransaction): Promise<Workflow[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(workflows)
      .where(eq(workflows.creatorId, creatorId))
      .orderBy(desc(workflows.updatedAt));
  }

  /**
   * Find workflows by status
   */
  async findByStatus(status: 'draft' | 'active' | 'archived', tx?: DbTransaction): Promise<Workflow[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(workflows)
      .where(eq(workflows.status, status))
      .orderBy(desc(workflows.updatedAt));
  }

  /**
   * Find workflows by creator and status
   */
  async findByCreatorAndStatus(
    creatorId: string,
    status: 'draft' | 'active' | 'archived',
    tx?: DbTransaction
  ): Promise<Workflow[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(workflows)
      .where(and(eq(workflows.creatorId, creatorId), eq(workflows.status, status)))
      .orderBy(desc(workflows.updatedAt));
  }
}

// Singleton instance
export const workflowRepository = new WorkflowRepository();
