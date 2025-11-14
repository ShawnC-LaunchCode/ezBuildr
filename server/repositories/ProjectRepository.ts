import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { projects, type Project, type InsertProject } from "@shared/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "../db";

/**
 * Repository for project data access
 */
export class ProjectRepository extends BaseRepository<typeof projects, Project, InsertProject> {
  constructor(dbInstance?: typeof db) {
    super(projects, dbInstance);
  }

  /**
   * Find projects by creator ID
   */
  async findByCreatorId(creatorId: string, tx?: DbTransaction): Promise<Project[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(projects)
      .where(eq(projects.createdBy, creatorId))
      .orderBy(desc(projects.updatedAt));
  }

  /**
   * Find projects by status
   */
  async findByStatus(status: 'active' | 'archived', tx?: DbTransaction): Promise<Project[]> {
    const database = this.getDb(tx);
    return await database
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
    return await database
      .select()
      .from(projects)
      .where(and(eq(projects.createdBy, creatorId), eq(projects.status, status)))
      .orderBy(desc(projects.updatedAt));
  }

  /**
   * Find active (non-archived) projects by creator
   */
  async findActiveByCreatorId(creatorId: string, tx?: DbTransaction): Promise<Project[]> {
    return this.findByCreatorAndStatus(creatorId, 'active', tx);
  }
}

// Singleton instance
export const projectRepository = new ProjectRepository();
