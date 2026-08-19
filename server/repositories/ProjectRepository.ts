import { eq, and, desc, or, inArray, getTableColumns, isNull, lt, sql, type SQL } from "drizzle-orm";

import { projects, organizations, projectAccess, teamMembers, type Project, type InsertProject } from "@shared/schema";

import { db } from "../db";
import type { CursorPosition } from "../utils/pagination";
import { getAccessibleOwnershipFilter } from "../utils/ownershipAccess";

import { BaseRepository, type DbTransaction } from "./BaseRepository";
const isUuid = (id: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * Options for the paginated creator-scoped list methods.
 * Ordering is stable `(createdAt desc, id desc)` — `cursor` must be the
 * `(createdAt, id)` of the last row on the previous page (see
 * `buildCursorWhere` in `server/utils/pagination.ts`). When `limit` is
 * provided, at most `limit + 1` rows are fetched (the extra row is how
 * callers detect `hasMore` without a separate count query).
 */
export interface ProjectListOptions {
  limit?: number;
  cursor?: CursorPosition;
}

/**
 * Row shape for queries that left-join `organizations` to surface the
 * owning org's display name (`null` for user-owned/legacy projects, or when
 * the org lookup doesn't match).
 */
export type ProjectWithOwnerName = Project & { ownerName: string | null };

/**
 * Build the keyset predicate for the `(createdAt desc, id desc)` ordering
 * used by findByCreatorId/findActiveByCreatorId: rows strictly after the
 * cursor's position in that ordering.
 */
function buildKeysetCondition(cursor: CursorPosition | undefined): SQL | undefined {
  if (!cursor) {
    return undefined;
  }
  return or(
    lt(projects.createdAt, cursor.timestamp),
    and(eq(projects.createdAt, cursor.timestamp), lt(projects.id, cursor.id))
  );
}

/**
 * Repository for project data access
 */
export class ProjectRepository extends BaseRepository<typeof projects, Project, InsertProject> {
  constructor(dbInstance?: typeof db) {
    super(projects, dbInstance);
  }

  /**
   * Build the ownership `OR` predicate shared by findByCreatorId and
   * findActiveByCreatorId: user-owned (new model), org-owned (new model),
   * ACL-shared (direct user grant or via team membership), and legacy
   * fallback (pre-ownership-model rows keyed by createdBy/creatorId).
   *
   * When `activeOnly` is true, every branch additionally requires
   * `status = 'active'` — `and(...)` drops `undefined` args, so passing
   * `statusCondition` (undefined when `activeOnly` is false) reproduces
   * today's per-branch status filtering exactly, just parameterized.
   */
  private buildOwnershipWhere(
    database: typeof db | DbTransaction,
    creatorId: string,
    orgIds: string[],
    activeOnly: boolean
  ): SQL | undefined {
    const statusCondition = activeOnly ? eq(projects.status, 'active') : undefined;
    const conditions: (SQL | undefined)[] = [];
    const sharedProjectIds = database
      .select({ projectId: projectAccess.projectId })
      .from(projectAccess)
      .where(
        or(
          and(
            eq(projectAccess.principalType, "user"),
            eq(projectAccess.principalId, creatorId)
          ),
          and(
            eq(projectAccess.principalType, "team"),
            inArray(
              projectAccess.principalId,
              database
                .select({ teamId: sql<string>`${teamMembers.teamId}::text` })
                .from(teamMembers)
                .where(eq(teamMembers.userId, creatorId))
            )
          )
        )
      );
    // Primary: New ownership model
    if (isUuid(creatorId)) {
      conditions.push(
        and(eq(projects.ownerType, 'user'), eq(projects.ownerUuid, creatorId), statusCondition)
      );
    }
    // Org-owned via new model
    if (orgIds.length > 0) {
      conditions.push(
        and(eq(projects.ownerType, 'org'), inArray(projects.ownerUuid, orgIds), statusCondition)
      );
    }
    // Explicit project sharing through ACL
    conditions.push(and(inArray(projects.id, sharedProjectIds), statusCondition));
    // Fallback: Legacy ownership (only for projects without new ownership)
    conditions.push(
      and(
        isNull(projects.ownerType),
        or(eq(projects.createdBy, creatorId), eq(projects.creatorId, creatorId)),
        statusCondition
      )
    );
    return or(...conditions);
  }

  /**
   * Find projects by creator ID (includes user-owned and org-owned)
   */
  async findByCreatorId(
    creatorId: string,
    options: ProjectListOptions = {},
    tx?: DbTransaction
  ): Promise<ProjectWithOwnerName[]> {
    const database = this.getDb(tx);
    // Get user's org memberships for org-owned project access
    const { orgIds } = await getAccessibleOwnershipFilter(creatorId, tx);
    const ownershipWhere = this.buildOwnershipWhere(database, creatorId, orgIds, false);
    const keysetCondition = buildKeysetCondition(options.cursor);
    const whereClause = keysetCondition ? and(ownershipWhere, keysetCondition) : ownershipWhere;
    // Join with organizations to get owner name
    const query = database
      .select({
        ...getTableColumns(projects),
        ownerName: organizations.name,
      })
      .from(projects)
      .leftJoin(
        organizations,
        and(
          eq(projects.ownerType, 'org'),
          eq(projects.ownerUuid, sql`${organizations.id}::text`)
        )
      )
      .where(whereClause)
      // Stable keyset ordering: must agree with buildKeysetCondition above.
      .orderBy(desc(projects.createdAt), desc(projects.id))
      .$dynamic();
    // Results already have all project columns + ownerName at top level
    return options.limit !== undefined ? query.limit(options.limit + 1) : query;
  }
  /**
   * Find active (non-archived) projects by creator (includes user-owned and org-owned)
   */
  async findActiveByCreatorId(
    creatorId: string,
    options: ProjectListOptions = {},
    tx?: DbTransaction
  ): Promise<ProjectWithOwnerName[]> {
    const database = this.getDb(tx);
    // Get user's org memberships for org-owned project access
    const { orgIds } = await getAccessibleOwnershipFilter(creatorId, tx);
    const ownershipWhere = this.buildOwnershipWhere(database, creatorId, orgIds, true);
    const keysetCondition = buildKeysetCondition(options.cursor);
    const whereClause = keysetCondition ? and(ownershipWhere, keysetCondition) : ownershipWhere;
    // Join with organizations to get owner name (PROJ-8: matches
    // findByCreatorId — the active list previously omitted this join).
    const query = database
      .select({
        ...getTableColumns(projects),
        ownerName: organizations.name,
      })
      .from(projects)
      .leftJoin(
        organizations,
        and(
          eq(projects.ownerType, 'org'),
          eq(projects.ownerUuid, sql`${organizations.id}::text`)
        )
      )
      .where(whereClause)
      // Stable keyset ordering: must agree with buildKeysetCondition above,
      // and with findByCreatorId's ordering (B5: kept consistent across
      // both query paths per PROJ-4).
      .orderBy(desc(projects.createdAt), desc(projects.id))
      .$dynamic();
    return options.limit !== undefined ? query.limit(options.limit + 1) : query;
  }

  /**
   * Find projects by ownership. Used for organization project lists.
   */
  async findByOwner(
    ownerType: 'user' | 'org',
    ownerUuid: string,
    activeOnly = false,
    tx?: DbTransaction
  ): Promise<ProjectWithOwnerName[]> {
    const database = this.getDb(tx);
    const conditions = [
      eq(projects.ownerType, ownerType),
      eq(projects.ownerUuid, ownerUuid),
    ];
    if (activeOnly) {
      conditions.push(eq(projects.status, 'active'));
    }
    return database
      .select({
        ...getTableColumns(projects),
        ownerName: organizations.name,
      })
      .from(projects)
      .leftJoin(
        organizations,
        and(
          eq(projects.ownerType, 'org'),
          eq(projects.ownerUuid, sql`${organizations.id}::text`)
        )
      )
      .where(and(...conditions))
      .orderBy(desc(projects.updatedAt));
  }
}
// Singleton instance
export const projectRepository = new ProjectRepository();
