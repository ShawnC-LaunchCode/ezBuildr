import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { workflows, type Workflow, type InsertWorkflow } from "@shared/schema";
import { eq, and, desc, isNull, or, inArray, count, sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Repository for workflow data access
 */
export class WorkflowRepository extends BaseRepository<typeof workflows, Workflow, InsertWorkflow> {
  constructor(dbInstance?: typeof db) {
    super(workflows, dbInstance);
  }

  /**
   * Create a new workflow and track stats
   */
  async create(data: InsertWorkflow, tx?: DbTransaction): Promise<Workflow> {
    const workflow = await super.create(data, tx);

    // Track lifetime stats
    try {
      const { systemStatsRepository } = await import("./SystemStatsRepository");
      await systemStatsRepository.incrementWorkflowsCreated();
    } catch (err) {
      // Don't fail the request if stats fail
      console.error("Failed to increment workflow stats:", err);
    }

    return workflow;
  }

  /**
   * Find workflows by creator ID (legacy)
   * @deprecated use findByUserAccess
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
   * Find workflows by user access (Owner OR Shared)
   */
  async findByUserAccess(userId: string, tx?: DbTransaction): Promise<Workflow[]> {
    const database = this.getDb(tx);

    // Import workflowAccess here to avoid circular dependencies if possible, or assume it's available
    const { workflowAccess } = await import("@shared/schema");

    // Subquery for shared workflows
    const sharedWorkflowIds = database
      .select({ workflowId: workflowAccess.workflowId })
      .from(workflowAccess)
      .where(eq(workflowAccess.principalId, userId));

    return await database
      .select()
      .from(workflows)
      .where(
        or(
          eq(workflows.creatorId, userId),
          eq(workflows.ownerId, userId),
          inArray(workflows.id, sharedWorkflowIds)
        )
      )
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
      .where(eq(workflows.status, status as any))
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
      .where(and(eq(workflows.creatorId, creatorId), eq(workflows.status, status as any)))
      .orderBy(desc(workflows.updatedAt));
  }

  /**
   * Find workflow by slug (Stage 12: Intake Portal)
   */
  async findBySlug(slug: string, tx?: DbTransaction): Promise<Workflow | null> {
    const database = this.getDb(tx);
    const [workflow] = await database
      .select()
      .from(workflows)
      .where(eq(workflows.slug, slug))
      .limit(1);
    return workflow || null;
  }

  /**
   * Find workflow by public link slug
   */
  async findByPublicLink(publicLink: string, tx?: DbTransaction): Promise<Workflow | null> {
    const database = this.getDb(tx);
    const [workflow] = await database
      .select()
      .from(workflows)
      .where(eq(workflows.publicLink, publicLink))
      .limit(1);
    return workflow || null;
  }

  /**
   * Find workflow by ID or slug (helper for UUID/slug resolution)
   */
  async findByIdOrSlug(idOrSlug: string, tx?: DbTransaction): Promise<Workflow | null> {
    // Try UUID first (faster and more common)
    const database = this.getDb(tx);

    const byId = await this.findById(idOrSlug, tx);
    if (byId) return byId;

    // If not found by ID, try slug
    return await this.findBySlug(idOrSlug, tx);
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

  /**
   * Get workflow statistics (admin only)
   * Optimized to use a single query instead of fetching all workflows
   */
  async getWorkflowStats(tx?: DbTransaction) {
    const database = this.getDb(tx);
    const { systemStatsRepository } = await import("./SystemStatsRepository");

    const [stats, systemStats] = await Promise.all([
      database
        .select({
          active: sql<number>`sum(case when ${workflows.status} = 'active' then 1 else 0 end)`,
          draft: sql<number>`sum(case when ${workflows.status} = 'draft' then 1 else 0 end)`,
          archived: sql<number>`sum(case when ${workflows.status} = 'archived' then 1 else 0 end)`,
        })
        .from(workflows),
      systemStatsRepository.getStats()
    ]);

    return {
      total: systemStats.totalWorkflowsCreated, // Use lifetime total
      active: Number(stats[0]?.active || 0),
      draft: Number(stats[0]?.draft || 0),
      archived: Number(stats[0]?.archived || 0),
    };
  }
}

// Singleton instance
export const workflowRepository = new WorkflowRepository();
