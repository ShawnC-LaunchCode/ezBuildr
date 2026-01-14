import { eq, and, inArray } from "drizzle-orm";

import { projectAccess, workflowAccess } from "@shared/schema";
import type {
  ProjectAccess,
  InsertProjectAccess,
  WorkflowAccess,
  InsertWorkflowAccess,
  PrincipalType,
} from "@shared/schema";

import { db } from "../db";

import { BaseRepository } from "./BaseRepository";

import type { DbTransaction } from "./BaseRepository";



/**
 * Repository for Project Access (ACL) operations
 */
export class ProjectAccessRepository extends BaseRepository<
  typeof projectAccess,
  ProjectAccess,
  InsertProjectAccess
> {
  constructor(dbInstance?: typeof db) {
    super(projectAccess, dbInstance);
  }

  /**
   * Find all ACL entries for a project
   */
  async findByProjectId(projectId: string, tx?: DbTransaction): Promise<ProjectAccess[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(projectAccess)
      .where(eq(projectAccess.projectId, projectId));
  }

  /**
   * Find ACL entry for a specific user on a project
   */
  async findByProjectAndUser(
    projectId: string,
    userId: string,
    tx?: DbTransaction
  ): Promise<ProjectAccess | undefined> {
    const database = this.getDb(tx);
    const [entry] = await database
      .select()
      .from(projectAccess)
      .where(
        and(
          eq(projectAccess.projectId, projectId),
          eq(projectAccess.principalType, "user"),
          eq(projectAccess.principalId, userId)
        )
      );

    return entry;
  }

  /**
   * Find ACL entries for specific teams on a project
   */
  async findByProjectAndTeams(
    projectId: string,
    teamIds: string[],
    tx?: DbTransaction
  ): Promise<ProjectAccess[]> {
    if (teamIds.length === 0) {return [];}

    const database = this.getDb(tx);
    return database
      .select()
      .from(projectAccess)
      .where(
        and(
          eq(projectAccess.projectId, projectId),
          eq(projectAccess.principalType, "team"),
          inArray(projectAccess.principalId, teamIds)
        )
      );
  }

  /**
   * Upsert (insert or update) an ACL entry
   */
  async upsert(
    projectId: string,
    principalType: PrincipalType,
    principalId: string,
    role: string,
    tx?: DbTransaction
  ): Promise<ProjectAccess> {
    const database = this.getDb(tx);

    // Try to insert, on conflict update the role
    const [entry] = await database
      .insert(projectAccess)
      .values({
        projectId,
        principalType,
        principalId,
        role,
      })
      .onConflictDoUpdate({
        target: [projectAccess.projectId, projectAccess.principalType, projectAccess.principalId],
        set: { role },
      })
      .returning();

    return entry;
  }

  /**
   * Delete an ACL entry
   */
  async deleteByPrincipal(
    projectId: string,
    principalType: PrincipalType,
    principalId: string,
    tx?: DbTransaction
  ): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(projectAccess)
      .where(
        and(
          eq(projectAccess.projectId, projectId),
          eq(projectAccess.principalType, principalType),
          eq(projectAccess.principalId, principalId)
        )
      );
  }
}

/**
 * Repository for Workflow Access (ACL) operations
 */
export class WorkflowAccessRepository extends BaseRepository<
  typeof workflowAccess,
  WorkflowAccess,
  InsertWorkflowAccess
> {
  constructor(dbInstance?: typeof db) {
    super(workflowAccess, dbInstance);
  }

  /**
   * Find all ACL entries for a workflow
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<WorkflowAccess[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(workflowAccess)
      .where(eq(workflowAccess.workflowId, workflowId));
  }

  /**
   * Find ACL entry for a specific user on a workflow
   */
  async findByWorkflowAndUser(
    workflowId: string,
    userId: string,
    tx?: DbTransaction
  ): Promise<WorkflowAccess | undefined> {
    const database = this.getDb(tx);
    const [entry] = await database
      .select()
      .from(workflowAccess)
      .where(
        and(
          eq(workflowAccess.workflowId, workflowId),
          eq(workflowAccess.principalType, "user"),
          eq(workflowAccess.principalId, userId)
        )
      );

    return entry;
  }

  /**
   * Find ACL entries for specific teams on a workflow
   */
  async findByWorkflowAndTeams(
    workflowId: string,
    teamIds: string[],
    tx?: DbTransaction
  ): Promise<WorkflowAccess[]> {
    if (teamIds.length === 0) {return [];}

    const database = this.getDb(tx);
    return database
      .select()
      .from(workflowAccess)
      .where(
        and(
          eq(workflowAccess.workflowId, workflowId),
          eq(workflowAccess.principalType, "team"),
          inArray(workflowAccess.principalId, teamIds)
        )
      );
  }

  /**
   * Upsert (insert or update) an ACL entry
   */
  async upsert(
    workflowId: string,
    principalType: PrincipalType,
    principalId: string,
    role: string,
    tx?: DbTransaction
  ): Promise<WorkflowAccess> {
    const database = this.getDb(tx);

    // Try to insert, on conflict update the role
    const [entry] = await database
      .insert(workflowAccess)
      .values({
        workflowId,
        principalType,
        principalId,
        role,
      })
      .onConflictDoUpdate({
        target: [workflowAccess.workflowId, workflowAccess.principalType, workflowAccess.principalId],
        set: { role },
      })
      .returning();

    return entry;
  }

  /**
   * Delete an ACL entry
   */
  async deleteByPrincipal(
    workflowId: string,
    principalType: PrincipalType,
    principalId: string,
    tx?: DbTransaction
  ): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(workflowAccess)
      .where(
        and(
          eq(workflowAccess.workflowId, workflowId),
          eq(workflowAccess.principalType, principalType),
          eq(workflowAccess.principalId, principalId)
        )
      );
  }
}

// Export singleton instances
export const projectAccessRepository = new ProjectAccessRepository();
export const workflowAccessRepository = new WorkflowAccessRepository();
