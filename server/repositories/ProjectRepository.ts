import { eq, and, desc, or, inArray, getTableColumns } from "drizzle-orm";

import { projects, organizations, type Project, type InsertProject } from "@shared/schema";

import { db } from "../db";
import { getAccessibleOwnershipFilter } from "../utils/ownershipAccess";

import { BaseRepository, type DbTransaction } from "./BaseRepository";
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
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
    // Fallback: Legacy ownership (only for projects without new ownership)
    conditions.push(
      and(
        eq(projects.ownerType, null as any),
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
          eq(projects.ownerUuid, organizations.id)
        )
      )
      .where(or(...conditions))
      .orderBy(desc(projects.updatedAt));
    // Results already have all project columns + ownerName at top level
    return results as any;
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
    // Fallback: Legacy ownership (only for projects without new ownership)
    conditions.push(
      and(
        eq(projects.ownerType, null as any),
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
}
// Singleton instance
export const projectRepository = new ProjectRepository();