import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { workflows, type Workflow, type InsertWorkflow } from "@shared/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
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
  async findByStatus(status: 'draft' | 'open' | 'closed', tx?: DbTransaction): Promise<Workflow[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(workflows)
      .where(eq(workflows.status, status as any))
      .orderBy(desc(workflows.updatedAt));
  }

  /**
   * Find workflows by creator and status
   */
  async findByCreatorAndStatus(
    creatorId: string,
    status: 'draft' | 'open' | 'closed',
    tx?: DbTransaction
  ): Promise<Workflow[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(workflows)
      .where(and(eq(workflows.creatorId, creatorId), eq(workflows.status, status as any)))
      .orderBy(desc(workflows.updatedAt));
  }

  /**
   * Find workflows by project ID
   */
  async findByProjectId(projectId: string, tx?: DbTransaction): Promise<Workflow[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, projectId))
      .orderBy(desc(workflows.updatedAt));
  }

  /**
   * Find unfiled workflows (workflows with no project) for a creator
   */
  async findUnfiledByCreatorId(creatorId: string, tx?: DbTransaction): Promise<Workflow[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(workflows)
      .where(and(eq(workflows.creatorId, creatorId), isNull(workflows.projectId)))
      .orderBy(desc(workflows.updatedAt));
  }

  /**
   * Move workflow to a project (or unfiled if projectId is null)
   */
  async moveToProject(
    workflowId: string,
    projectId: string | null,
    tx?: DbTransaction
  ): Promise<Workflow> {
    const database = this.getDb(tx);
    const [workflow] = await database
      .update(workflows)
      .set({ projectId, updatedAt: new Date() })
      .where(eq(workflows.id, workflowId))
      .returning();
    return workflow;
  }
}

// Singleton instance
export const workflowRepository = new WorkflowRepository();
