
import { eq, and, desc, isNull, or, inArray, sql, getTableColumns } from "drizzle-orm";

import { workflows, organizations, type Workflow, type InsertWorkflow } from "@shared/schema";

import { db, type DrizzleDB } from "../db";
import { logger } from "../logger";
import { getAccessibleOwnershipFilter } from "../utils/ownershipAccess";

import { BaseRepository, type DbTransaction } from "./BaseRepository";
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
    // Track lifetime stats. Pass tx through: when create() runs inside a
    // transaction, a pool-based increment would deadlock under a
    // single-connection pool (see SystemStatsRepository).
    try {
      const { systemStatsRepository } = await import("./SystemStatsRepository");
      await systemStatsRepository.incrementWorkflowsCreated(1, tx);
    } catch (err) {
      // Don't fail the request if stats fail
      logger.warn({ err }, "Failed to increment workflow stats");
    }
    return workflow;
  }
  /**
   * Update a record by ID (override)
   */
  async update(id: string, updates: Partial<InsertWorkflow>, tx?: DbTransaction): Promise<Workflow> {
    const database = this.getDb(tx);
    const effectiveUpdates = { ...updates, updatedAt: new Date() };
    const [record] = await database
      .update(workflows)
      .set(effectiveUpdates)
      .where(eq(workflows.id, id))

      .returning();
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (updates.status && record && record.status !== updates.status) {
      logger.warn({ workflowId: id, requested: updates.status, got: record.status }, "Workflow status mismatch after update");
    }
    if (record == null) {throw new Error("Failed to update workflow");}
    return record;
  }
  /**
   * Find workflows by creator ID (includes user-owned and org-owned)
   * @deprecated use findByUserAccess for full access control
   */
  async findByCreatorId(
    creatorId: string,
    options?: { limit?: number; offset?: number },
    tx?: DbTransaction
  ): Promise<Workflow[]> {
    const database = this.getDb(tx);
    // Get user's org memberships for org-owned workflow access
    const { orgIds } = await getAccessibleOwnershipFilter(creatorId, tx);
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
        isNull(workflows.ownerType),
        or(eq(workflows.creatorId, creatorId), eq(workflows.ownerId, creatorId))
      )
    );
    // Join with organizations to get owner name
    const query = database
      .select({
        ...getTableColumns(workflows),
        ownerName: organizations.name,
      })
      .from(workflows)
      .leftJoin(
        organizations,
        and(
          eq(workflows.ownerType, 'org'),
          eq(workflows.ownerUuid, sql`${organizations.id}::text`)
        )
      )
      .where(or(...conditions))
      .orderBy(desc(workflows.updatedAt))
      .$dynamic();
    if (options?.limit !== undefined) { void query.limit(options.limit); }
    if (options?.offset !== undefined) { void query.offset(options.offset); }
    return query as unknown as Promise<Workflow[]>; // Join result shape is compatible with Workflow[]
  }
  /**
   * Admin-only: every workflow attributable to a single user — created by
   * them, or owned by them under either the legacy (`ownerId`) or current
   * (`ownerType`/`ownerUuid`) ownership model.
   *
   * Deliberately does NOT expand org memberships the way findByCreatorId
   * does. This backs the admin copy/delete UI, and a workflow the user can
   * merely reach through an org they belong to is not theirs to delete.
   *
   * RLS-6: `adminDbOverride` is `server/db/adminDb.ts`'s BYPASSRLS instance,
   * passed explicitly by `AdminAccessService` — see `UserRepository.findAllUsers`'s
   * doc comment for why this can't be a global switch.
   */
  async findAttributedToUser(
    userId: string,
    tx?: DbTransaction,
    adminDbOverride?: DrizzleDB
  ): Promise<Array<Workflow & { ownerName: string | null }>> {
    const database = adminDbOverride ?? this.getDb(tx);
    // ownerUuid holds a UUID; comparing a legacy non-UUID id against it in
    // Postgres is a wasted predicate at best.
    const ownedUnderNewModel = isUuid(userId)
      ? [and(eq(workflows.ownerType, 'user'), eq(workflows.ownerUuid, userId))]
      : [];
    return database
      .select({
        ...getTableColumns(workflows),
        ownerName: organizations.name,
      })
      .from(workflows)
      .leftJoin(
        organizations,
        and(
          eq(workflows.ownerType, 'org'),
          eq(workflows.ownerUuid, sql`${organizations.id}::text`)
        )
      )
      .where(or(
        eq(workflows.creatorId, userId),
        eq(workflows.ownerId, userId),
        ...ownedUnderNewModel
      ))
      .orderBy(desc(workflows.updatedAt));
  }

  /**
   * Find workflows by user access (Owner OR Shared OR Org-owned)
   */
  async findByUserAccess(
    userId: string,
    options?: { limit?: number; offset?: number },
    tx?: DbTransaction
  ): Promise<Workflow[]> {
    const database = this.getDb(tx);
    // Import workflowAccess here to avoid circular dependencies if possible, or assume it's available
    const { workflowAccess } = await import("@shared/schema");
    // Get user's org memberships for org-owned workflow access
    const { orgIds } = await getAccessibleOwnershipFilter(userId, tx);
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
        isNull(workflows.ownerType),
        or(eq(workflows.creatorId, userId), eq(workflows.ownerId, userId))
      )
    );
    let query = database
      .select()
      .from(workflows)
      .where(or(...conditions))
      .orderBy(desc(workflows.updatedAt))
      .$dynamic();
    if (options?.limit !== undefined) { query = query.limit(options.limit); }
    if (options?.offset !== undefined) { query = query.offset(options.offset); }
    return query;
  }
  /**
   * Find workflows by status
   */
  async findByStatus(
    status: 'draft' | 'active' | 'archived',
    options?: { limit?: number; offset?: number },
    tx?: DbTransaction
  ): Promise<Workflow[]> {
    const database = this.getDb(tx);
    let query = database
      .select()
      .from(workflows)
      .where(eq(workflows.status, status))
      .orderBy(desc(workflows.updatedAt))
      .$dynamic();
    if (options?.limit !== undefined) { query = query.limit(options.limit); }
    if (options?.offset !== undefined) { query = query.offset(options.offset); }
    return query;
  }
  /**
   * Find workflows by creator and status (includes user-owned and org-owned)
   */
  async findByCreatorAndStatus(
    creatorId: string,
    status: 'draft' | 'active' | 'archived',
    options?: { limit?: number; offset?: number },
    tx?: DbTransaction
  ): Promise<Workflow[]> {
    const database = this.getDb(tx);
    // Get user's org memberships for org-owned workflow access
    const { orgIds } = await getAccessibleOwnershipFilter(creatorId, tx);
    // Build conditions for ownership access
    const conditions = [
      and(eq(workflows.creatorId, creatorId), eq(workflows.status, status)),
      and(eq(workflows.ownerId, creatorId), eq(workflows.status, status)),
    ];
    // User-owned via new ownership model
    if (isUuid(creatorId)) {
      conditions.push(
        and(
          eq(workflows.ownerType, 'user'),
          eq(workflows.ownerUuid, creatorId),
          eq(workflows.status, status)
        )
      );
    }
    // Add org-owned condition if user is member of any orgs
    if (orgIds.length > 0) {
      conditions.push(
        and(
          eq(workflows.ownerType, 'org'),
          inArray(workflows.ownerUuid, orgIds),
          eq(workflows.status, status)
        )
      );
    }
    let query = database
      .select()
      .from(workflows)
      .where(or(...conditions))
      .orderBy(desc(workflows.updatedAt))
      .$dynamic();
    if (options?.limit !== undefined) { query = query.limit(options.limit); }
    if (options?.offset !== undefined) { query = query.offset(options.offset); }
    return query;
  }
  /**
   * Find all workflows whose slug starts with the given prefix.
   * Used by ensureUniqueSlug to avoid N+1 loop queries.
   */
  async findSlugsByPrefix(prefix: string, tx?: DbTransaction): Promise<Array<{ id: string; slug: string }>> {
    const database = this.getDb(tx);
    const rows = await database
      .select({ id: workflows.id, slug: workflows.slug })
      .from(workflows)
      .where(sql`${workflows.slug} LIKE ${`${prefix}%`}`); // eslint-disable-line sonarjs/no-nested-template-literals
    return rows.filter((r): r is { id: string; slug: string } => r.slug !== null);
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
    return workflow ?? null;
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
    return workflow ?? null;
  }
  /**
   * Find workflow by ID or slug (helper for UUID/slug resolution)
   */
  /**
   * `findById` for the admin console's cross-tenant path.
   *
   * RLS-6: `adminDbOverride` is `server/db/adminDb.ts`'s BYPASSRLS instance,
   * passed by `AdminAccessService` (the only module allowed to import it).
   * A separate method rather than an extra parameter on `BaseRepository
   * .findById`, because a bypass hook on every repository method is the
   * opposite of the containment RLS-6 exists to create. With no override it
   * degrades to the ordinary scoped read.
   */
  async findByIdForAdmin(
    id: string,
    adminDbOverride?: DrizzleDB
  ): Promise<Workflow | undefined> {
    if (!adminDbOverride) { return this.findById(id); }
    const [row] = await adminDbOverride.select().from(workflows).where(eq(workflows.id, id)).limit(1);
    return row;
  }

  async findByIdOrSlug(idOrSlug: string, tx?: DbTransaction): Promise<Workflow | null> {
    // Try UUID first (faster and more common)
    const _database = this.getDb(tx);
    const byId = await this.findById(idOrSlug, tx);
    if (byId) { return byId; }
    // If not found by ID, try slug
    return this.findBySlug(idOrSlug, tx);
  }
  /**
   * Find workflows by project ID
   */
  async findByProjectId(
    projectId: string,
    options?: { limit?: number; offset?: number },
    tx?: DbTransaction
  ): Promise<Workflow[]> {
    const database = this.getDb(tx);
    let query = database
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, projectId))
      .orderBy(desc(workflows.updatedAt))
      .$dynamic();
    if (options?.limit !== undefined) { query = query.limit(options.limit); }
    if (options?.offset !== undefined) { query = query.offset(options.offset); }
    return query;
  }
  /**
   * Find unfiled workflows (workflows with no project) for a creator (includes user-owned and org-owned)
   */
  async findUnfiledByCreatorId(
    creatorId: string,
    options?: { limit?: number; offset?: number },
    tx?: DbTransaction
  ): Promise<Workflow[]> {
    const database = this.getDb(tx);
    // Get user's org memberships for org-owned workflow access
    const { orgIds } = await getAccessibleOwnershipFilter(creatorId, tx);
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
    let query = database
      .select()
      .from(workflows)
      .where(or(...conditions))
      .orderBy(desc(workflows.updatedAt))
      .$dynamic();
    if (options?.limit !== undefined) { query = query.limit(options.limit); }
    if (options?.offset !== undefined) { query = query.offset(options.offset); }
    return query;
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
    if (workflow == null) {throw new Error("Failed to move workflow");}
    return workflow;
  }
  /**
   * Get workflow statistics (admin only)
   * Optimized to use a single query instead of fetching all workflows
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
      active: Number(stats[0]?.active ?? 0),
      draft: Number(stats[0]?.draft ?? 0),
      archived: Number(stats[0]?.archived ?? 0),
    };
  }
}
// Singleton instance
export const workflowRepository = new WorkflowRepository();
