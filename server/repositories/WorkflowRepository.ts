import { eq, and, desc, isNull, or, inArray, count, sql, getTableColumns } from "drizzle-orm";

import { workflows, organizations, type Workflow, type InsertWorkflow } from "@shared/schema";

import { db } from "../db";
import { getAccessibleOwnershipFilter } from "../utils/ownershipAccess";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);


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
   * Find workflows by creator ID (includes user-owned and org-owned)
   * @deprecated use findByUserAccess for full access control
   */
  async findByCreatorId(creatorId: string, tx?: DbTransaction): Promise<Workflow[]> {
    const database = this.getDb(tx);

    // Get user's org memberships for org-owned workflow access
    const { orgIds } = await getAccessibleOwnershipFilter(creatorId);

    // Build conditions for ownership access
    // Prioritize new ownership model to avoid duplicates
    const conditions = [];

    // Primary: New ownership model
    if (isUuid(creatorId)) {
      conditions.push(
        and(eq(workflows.ownerType, 'user'), eq(workflows.ownerUuid, creatorId))
      );
    }


    // Org-owned via new model
    if (orgIds.length > 0) {
      conditions.push(
        and(eq(workflows.ownerType, 'org'), inArray(workflows.ownerUuid, orgIds))
      );
    }

    // Fallback: Legacy ownership (only for workflows without new ownership)
    conditions.push(
      and(
        eq(workflows.ownerType, null as any),
        or(eq(workflows.creatorId, creatorId), eq(workflows.ownerId, creatorId))
      )
    );

    // Join with organizations to get owner name
    const results = await database
      .select({
        ...getTableColumns(workflows),
        ownerName: organizations.name,
      })
      .from(workflows)
      .leftJoin(
        organizations,
        and(
          eq(workflows.ownerType, 'org'),
          eq(workflows.ownerUuid, organizations.id)
        )
      )
      .where(or(...conditions))
      .orderBy(desc(workflows.updatedAt));

    // Results already have all workflow columns + ownerName at top level
    return results as any;
  }

  /**
   * Find workflows by user access (Owner OR Shared OR Org-owned)
   */
  async findByUserAccess(userId: string, tx?: DbTransaction): Promise<Workflow[]> {
    const database = this.getDb(tx);

    // Import workflowAccess here to avoid circular dependencies if possible, or assume it's available
    const { workflowAccess } = await import("@shared/schema");

    // Get user's org memberships for org-owned workflow access
    const { orgIds } = await getAccessibleOwnershipFilter(userId);

    // Subquery for shared workflows
    const sharedWorkflowIds = database
      .select({ workflowId: workflowAccess.workflowId })
      .from(workflowAccess)
      .where(eq(workflowAccess.principalId, userId));

    // Build conditions for ownership access
    // Prioritize new ownership model to avoid duplicates
    const conditions = [];

    // 1. New ownership model: user-owned
    if (isUuid(userId)) {
      conditions.push(
        and(eq(workflows.ownerType, 'user'), eq(workflows.ownerUuid, userId))
      );
    }


    // 2. New ownership model: org-owned
    if (orgIds.length > 0) {
      conditions.push(
        and(eq(workflows.ownerType, 'org'), inArray(workflows.ownerUuid, orgIds))
      );
    }

    // 3. Shared workflows (via ACL)
    conditions.push(inArray(workflows.id, sharedWorkflowIds));

    // 4. Legacy ownership (only for workflows without new ownership model)
    conditions.push(
      and(
        eq(workflows.ownerType, null as any),
        or(eq(workflows.creatorId, userId), eq(workflows.ownerId, userId))
      )
    );

    return database
      .select()
      .from(workflows)
      .where(or(...conditions))
      .orderBy(desc(workflows.updatedAt));
  }

  /**
   * Find workflows by status
   */
  async findByStatus(status: 'draft' | 'active' | 'archived', tx?: DbTransaction): Promise<Workflow[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(workflows)
      .where(eq(workflows.status, status as any))
      .orderBy(desc(workflows.updatedAt));
  }

  /**
   * Find workflows by creator and status (includes user-owned and org-owned)
   */
  async findByCreatorAndStatus(
    creatorId: string,
    status: 'draft' | 'active' | 'archived',
    tx?: DbTransaction
  ): Promise<Workflow[]> {
    const database = this.getDb(tx);

    // Get user's org memberships for org-owned workflow access
    const { orgIds } = await getAccessibleOwnershipFilter(creatorId);

    // Build conditions for ownership access
    const conditions = [
      and(eq(workflows.creatorId, creatorId), eq(workflows.status, status as any)), // Legacy
      and(eq(workflows.ownerId, creatorId), eq(workflows.status, status as any)), // Legacy
    ];

    // User-owned via new ownership model
    if (isUuid(creatorId)) {
      conditions.push(
        and(
          eq(workflows.ownerType, 'user'),
          eq(workflows.ownerUuid, creatorId),
          eq(workflows.status, status as any)
        )
      );
    }


    // Add org-owned condition if user is member of any orgs
    if (orgIds.length > 0) {
      conditions.push(
        and(
          eq(workflows.ownerType, 'org'),
          inArray(workflows.ownerUuid, orgIds),
          eq(workflows.status, status as any)
        )
      );
    }

    return database
      .select()
      .from(workflows)
      .where(or(...conditions))
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
    if (byId) { return byId; }

    // If not found by ID, try slug
    return this.findBySlug(idOrSlug, tx);
  }

  /**
   * Find workflows by project ID
   */
  async findByProjectId(projectId: string, tx?: DbTransaction): Promise<Workflow[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, projectId))
      .orderBy(desc(workflows.updatedAt));
  }

  /**
   * Find unfiled workflows (workflows with no project) for a creator (includes user-owned and org-owned)
   */
  async findUnfiledByCreatorId(creatorId: string, tx?: DbTransaction): Promise<Workflow[]> {
    const database = this.getDb(tx);

    // Get user's org memberships for org-owned workflow access
    const { orgIds } = await getAccessibleOwnershipFilter(creatorId);

    // Build conditions for ownership access
    const conditions = [
      and(eq(workflows.creatorId, creatorId), isNull(workflows.projectId)), // Legacy
      and(eq(workflows.ownerId, creatorId), isNull(workflows.projectId)), // Legacy
    ];

    // User-owned via new ownership model
    if (isUuid(creatorId)) {
      conditions.push(
        and(
          eq(workflows.ownerType, 'user'),
          eq(workflows.ownerUuid, creatorId),
          isNull(workflows.projectId)
        )
      );
    }


    // Add org-owned condition if user is member of any orgs
    if (orgIds.length > 0) {
      conditions.push(
        and(
          eq(workflows.ownerType, 'org'),
          inArray(workflows.ownerUuid, orgIds),
          isNull(workflows.projectId)
        )
      );
    }

    return database
      .select()
      .from(workflows)
      .where(or(...conditions))
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
