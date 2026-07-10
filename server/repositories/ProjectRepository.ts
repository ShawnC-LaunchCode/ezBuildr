import { eq, and, desc, or, inArray, getTableColumns, isNull, sql } from "drizzle-orm";

import { projects, organizations, projectAccess, teamMembers, type Project, type InsertProject } from "@shared/schema";

import { db } from "../db";
import { getAccessibleOwnershipFilter } from "../utils/ownershipAccess";

import { BaseRepository, type DbTransaction } from "./BaseRepository";
const isUuid = (id: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
/**
 * Repository for project data access
 */
export class ProjectRepository extends BaseRepository<typeof projects, Project, InsertProject> {
  constructor(dbInstance?: typeof db) {
    super(projects, dbInstance);
  }
  /**
   * Find projects by creator ID (includes user-owned and org-owned)
   */
  async findByCreatorId(creatorId: string, tx?: DbTransaction): Promise<Project[]> {
    const database = this.getDb(tx);
    // Get user's org memberships for org-owned project access
    const { orgIds } = await getAccessibleOwnershipFilter(creatorId);
    // Build conditions for ownership access
    // Prioritize new ownership model to avoid duplicates
    const conditions = [];
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
        and(eq(projects.ownerType, 'user'), eq(projects.ownerUuid, creatorId))
      );
    }
    // Org-owned via new model
    if (orgIds.length > 0) {
      conditions.push(
        and(eq(projects.ownerType, 'org'), inArray(projects.ownerUuid, orgIds))
      );
    }
    // Explicit project sharing through ACL
    conditions.push(inArray(projects.id, sharedProjectIds));
    // Fallback: Legacy ownership (only for projects without new ownership)
    conditions.push(
      and(
        isNull(projects.ownerType),
        or(eq(projects.createdBy, creatorId), eq(projects.creatorId, creatorId))
      )
    );
    // Join with organizations to get owner name
    const results = await database
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
      .where(or(...conditions))
      .orderBy(desc(projects.updatedAt));
    // Results already have all project columns + ownerName at top level
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
    return results as any; // Drizzle join result with organization name
  }
  /**
   * Find projects by status
   */
  async findByStatus(status: 'active' | 'archived', tx?: DbTransaction): Promise<Project[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(projects)
      .where(eq(projects.status, status))
      .orderBy(desc(projects.updatedAt));
  }
  /**
   * Find projects by creator and status
   */
  async findByCreatorAndStatus(
    creatorId: string,
    status: 'active' | 'archived',
    tx?: DbTransaction
  ): Promise<Project[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(projects)
      .where(and(eq(projects.createdBy, creatorId), eq(projects.status, status)))
      .orderBy(desc(projects.updatedAt));
  }
  /**
   * Find active (non-archived) projects by creator (includes user-owned and org-owned)
   */
  async findActiveByCreatorId(creatorId: string, tx?: DbTransaction): Promise<Project[]> {
    const database = this.getDb(tx);
    // Get user's org memberships for org-owned project access
    const { orgIds } = await getAccessibleOwnershipFilter(creatorId);
    // Build conditions for ownership access
    // Prioritize new ownership model to avoid duplicates
    const conditions = [];
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
        and(
          eq(projects.ownerType, 'user'),
          eq(projects.ownerUuid, creatorId),
          eq(projects.status, 'active')
        )
      );
    }
    // Org-owned via new model
    if (orgIds.length > 0) {
      conditions.push(
        and(
          eq(projects.ownerType, 'org'),
          inArray(projects.ownerUuid, orgIds),
          eq(projects.status, 'active')
        )
      );
    }
    // Explicit project sharing through ACL
    conditions.push(
      and(
        inArray(projects.id, sharedProjectIds),
        eq(projects.status, 'active')
      )
    );
    // Fallback: Legacy ownership (only for projects without new ownership)
    conditions.push(
      and(
        isNull(projects.ownerType),
        or(eq(projects.createdBy, creatorId), eq(projects.creatorId, creatorId)),
        eq(projects.status, 'active')
      )
    );
    return database
      .select()
      .from(projects)
      .where(or(...conditions))
      .orderBy(desc(projects.updatedAt));
  }

  /**
   * Find projects by ownership. Used for organization project lists.
   */
  async findByOwner(
    ownerType: 'user' | 'org',
    ownerUuid: string,
    activeOnly = false,
    tx?: DbTransaction
  ): Promise<Project[]> {
    const database = this.getDb(tx);
    const conditions = [
      eq(projects.ownerType, ownerType),
      eq(projects.ownerUuid, ownerUuid),
    ];
    if (activeOnly) {
      conditions.push(eq(projects.status, 'active'));
    }
    const results = await database
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
    return results as any;
  }
}
// Singleton instance
export const projectRepository = new ProjectRepository();
