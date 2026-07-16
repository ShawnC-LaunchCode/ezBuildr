import { and, eq, inArray } from "drizzle-orm";

import type { Project, InsertProject, Workflow, ProjectAccess, PrincipalType, AccessRole } from "@shared/schema";
import { workflows, workflowRuns, datavaultDatabases, datavaultTables, workflowDataSources } from "@shared/schema";

import { db } from "../db";
import {
  projectRepository,
  workflowRepository,
  projectAccessRepository,
  type DbTransaction,
  type ProjectListOptions,
  type ProjectWithOwnerName,
} from "../repositories";
import { canCreateWithOwnership, canManageOrg, isOrgMember } from "../utils/ownershipAccess";

import { aclService } from "./AclService";
import { transferService } from "./TransferService";
/**
 * Service layer for project-related business logic
 */
export class ProjectService {
  private projectRepo: typeof projectRepository;
  private workflowRepo: typeof workflowRepository;
  private projectAccessRepo: typeof projectAccessRepository;
  constructor(
    projectRepo?: typeof projectRepository,
    workflowRepo?: typeof workflowRepository,
    projectAccessRepo?: typeof projectAccessRepository
  ) {
    this.projectRepo = projectRepo ?? projectRepository;
    this.workflowRepo = workflowRepo ?? workflowRepository;
    this.projectAccessRepo = projectAccessRepo ?? projectAccessRepository;
  }

  private hasMinimumRole(userRole: AccessRole, minRole: Exclude<AccessRole, 'none'>): boolean {
    const rolePrecedence: Record<AccessRole, number> = {
      owner: 4,
      edit: 3,
      view: 2,
      none: 1,
    };
    return rolePrecedence[userRole] >= rolePrecedence[minRole];
  }

  private async requireOrgAdminForOrgOwnedProject(project: Project, userId: string, action: string): Promise<void> {
    if (project.ownerType === 'org' && project.ownerUuid && !(await canManageOrg(userId, project.ownerUuid))) {
      throw new Error(`Access denied: Organization admin role required to ${action} organization projects`);
    }
  }

  async verifyProjectAccess(
    projectId: string,
    userId: string,
    minRole: Exclude<AccessRole, 'none'> = 'view'
  ): Promise<Project> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const userRole = await aclService.resolveRoleForProject(userId, projectId);
    if (!this.hasMinimumRole(userRole, minRole)) {
      throw new Error("Access denied - insufficient permissions for this project");
    }

    return project;
  }

  /**
   * Verify user owns or has access to the project (ownership-based access)
   */
  async verifyOwnership(projectId: string, userId: string): Promise<Project> {
    return this.verifyProjectAccess(projectId, userId, 'view');
  }
  /**
   * Create a new project
   */
  async createProject(data: InsertProject, creatorId: string): Promise<Project> {
    // Validate ownership before creating
    const ownerType = data.ownerType ?? 'user';
    const ownerUuid = data.ownerUuid ?? creatorId;

    if (ownerType === 'org') {
      const canManage = await canManageOrg(creatorId, ownerUuid);
      if (!canManage) {
        throw new Error('Access denied: Organization admin role required to create organization projects');
      }
    } else {
      const canCreate = await canCreateWithOwnership(creatorId, ownerType, ownerUuid);
      if (!canCreate) {
        throw new Error('Access denied: You do not have permission to create assets with this ownership');
      }
    }

    const title = data.title ?? data.name ?? 'Untitled Project';
    return this.projectRepo.create({
      ...data,
      title,
      name: data.name ?? title,
      creatorId: creatorId, // Legacy field (required)
      createdBy: creatorId,
      ownerId: creatorId, // Creator is also the initial owner (legacy)
      ownerType,
      ownerUuid,
      status: 'active',
    });
  }
  /**
   * Get project by ID with contained workflows
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getProjectWithWorkflows(projectId: string, userId: string) {
    const project = await this.verifyProjectAccess(projectId, userId, 'view');
    const workflows = await this.workflowRepo.findByProjectId(projectId);
    return {
      ...project,
      workflows,
    };
  }
  /**
   * List all projects for a user
   */
  async listProjects(creatorId: string, options: ProjectListOptions = {}): Promise<ProjectWithOwnerName[]> {
    return this.projectRepo.findByCreatorId(creatorId, options);
  }
  /**
   * List active (non-archived) projects for a user
   */
  async listActiveProjects(creatorId: string, options: ProjectListOptions = {}): Promise<ProjectWithOwnerName[]> {
    return this.projectRepo.findActiveByCreatorId(creatorId, options);
  }
  /**
   * List projects owned by a specific organization.
   */
  async listOrganizationProjects(orgId: string, userId: string, activeOnly = true): Promise<ProjectWithOwnerName[]> {
    const isMember = await isOrgMember(userId, orgId);
    if (!isMember) {
      throw new Error("Access denied - you do not have permission to access this organization");
    }
    return this.projectRepo.findByOwner('org', orgId, activeOnly);
  }
  /**
   * Update project
   */
  async updateProject(
    projectId: string,
    userId: string,
    data: Partial<InsertProject>
  ): Promise<Project> {
    const project = await this.verifyProjectAccess(projectId, userId, 'edit');
    if (data.status !== undefined || data.archived !== undefined) {
      const willArchive = data.status === 'archived' || data.archived === true;
      await this.requireOrgAdminForOrgOwnedProject(project, userId, willArchive ? 'archive' : 'unarchive');
    }
    return this.projectRepo.update(projectId, data);
  }
  /**
   * Shared write path for putting a project into the archived state.
   * `archiveProject` and `deleteProject` both call this instead of each
   * writing `{ status: 'archived', archived: true }` independently, so the
   * two entry points can't drift apart (PROJ-5).
   */
  private async writeArchivedState(projectId: string): Promise<Project> {
    return this.projectRepo.update(projectId, {
      status: 'archived',
      archived: true,
    });
  }
  /**
   * Archive project (soft delete)
   */
  async archiveProject(projectId: string, userId: string): Promise<Project> {
    const project = await this.verifyProjectAccess(projectId, userId, 'edit');
    await this.requireOrgAdminForOrgOwnedProject(project, userId, 'archive');
    return this.writeArchivedState(projectId);
  }
  /**
   * Unarchive project
   *
   * NOTE (deliberate, Backlog B6): this is gated at 'edit', the same as
   * archiveProject. Because `deleteProject` below writes the identical
   * archived state as archiveProject, there is no way to distinguish an
   * "archived" project from an owner-"deleted" one — so an edit-role user
   * can unarchive a project that its owner deleted. Closing this requires a
   * `deletedAt` column plus owner-gated resurrect, tracked as Backlog B6;
   * not addressed here.
   */
  async unarchiveProject(projectId: string, userId: string): Promise<Project> {
    const project = await this.verifyProjectAccess(projectId, userId, 'edit');
    await this.requireOrgAdminForOrgOwnedProject(project, userId, 'unarchive');
    return this.projectRepo.update(projectId, {
      status: 'active',
      archived: false,
    });
  }
  /**
   * Delete project (soft delete — archives the project; workflows are
   * retained, not detached or destroyed).
   *
   * Writes the exact same archived state as `archiveProject`, via the
   * shared `writeArchivedState` helper, so the two paths cannot drift. The
   * only difference is authorization: this is gated at 'owner' (+ org-admin
   * for org-owned projects) rather than `archiveProject`'s 'edit' gate. See
   * the note on `unarchiveProject` above (Backlog B6) for the resulting
   * quirk: an edit-role user can unarchive a project that was "deleted" by
   * its owner, since the row is indistinguishable from a plain archive.
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    const project = await this.verifyProjectAccess(projectId, userId, 'owner');
    await this.requireOrgAdminForOrgOwnedProject(project, userId, 'delete');
    await this.writeArchivedState(projectId);
  }
  /**
   * Get workflows in a project
   */
  async getProjectWorkflows(projectId: string, userId: string): Promise<Workflow[]> {
    await this.verifyProjectAccess(projectId, userId, 'view');
    return this.workflowRepo.findByProjectId(projectId);
  }
  /**
   * Count workflows in a project
   */
  async countProjectWorkflows(projectId: string, userId: string): Promise<number> {
    await this.verifyProjectAccess(projectId, userId, 'view');
    const workflows = await this.workflowRepo.findByProjectId(projectId);
    return workflows.length;
  }
  // ===================================================================
  // ACL MANAGEMENT METHODS
  // ===================================================================
  /**
   * Get all ACL entries for a project
   */
  async getProjectAccess(projectId: string, userId: string, tx?: DbTransaction): Promise<ProjectAccess[]> {
    await this.verifyProjectAccess(projectId, userId, 'view');
    return this.projectAccessRepo.findByProjectId(projectId, tx);
  }
  /**
   * Grant or update access to a project
   * Only owner can grant 'owner' role to others
   */
  async grantProjectAccess(
    projectId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string; role: string }>,
    tx?: DbTransaction
  ): Promise<ProjectAccess[]> {
    await this.verifyProjectAccess(projectId, requestorId, 'owner');
    const results: ProjectAccess[] = [];
    for (const entry of entries) {
      const acl = await this.projectAccessRepo.upsert(
        projectId,
        entry.principalType,
        entry.principalId,
        entry.role,
        tx
      );
      results.push(acl);
    }
    return results;
  }
  /**
   * Revoke access from a project
   */
  async revokeProjectAccess(
    projectId: string,
    requestorId: string,
    entries: Array<{ principalType: PrincipalType; principalId: string }>,
    tx?: DbTransaction
  ): Promise<void> {
    await this.verifyProjectAccess(projectId, requestorId, 'owner');
    for (const entry of entries) {
      await this.projectAccessRepo.deleteByPrincipal(
        projectId,
        entry.principalType,
        entry.principalId,
        tx
      );
    }
  }
  /**
   * Transfer project ownership (new ownership model)
   * Cascades to all child workflows AND their runs
   *
   * @param projectId - Project to transfer
   * @param userId - User requesting transfer
   * @param targetOwnerType - 'user' or 'org'
   * @param targetOwnerUuid - UUID of target owner
   */
  async transferOwnership(
    projectId: string,
    userId: string,
    targetOwnerType: 'user' | 'org',
    targetOwnerUuid: string
  ): Promise<Project> {
    // Authorization checks run outside the transaction — they only read.
    const project = await this.verifyProjectAccess(projectId, userId, 'owner');
    await this.requireOrgAdminForOrgOwnedProject(project, userId, 'transfer');
    // Transfer-into-org requires org membership (not admin); validateTransfer
    // checks target existence first ("not found") then membership ("not a member").
    await transferService.validateTransfer(
      userId,
      project.ownerType ?? 'user',
      project.ownerUuid ?? project.ownerId ?? project.createdBy ?? project.creatorId,
      targetOwnerType,
      targetOwnerUuid
    );
    // Everything below is a single multi-table cascade — wrap it in one
    // transaction so a failure partway (network blip, constraint violation)
    // cannot leave the project pointing at the new owner while workflows,
    // runs, or DataVault assets still belong to the old one. Every query in
    // this callback MUST use `tx` (not the pool `db`) — a pool query issued
    // while the transaction still holds the connection deadlocks the size-1
    // test pool.
    return db.transaction(async (tx) => {
      // Update project ownership
      const updatedProject = await this.projectRepo.update(
        projectId,
        {
          ownerType: targetOwnerType,
          ownerUuid: targetOwnerUuid,
        },
        tx
      );
      // Cascade: Transfer all child workflows to same owner
      const projectWorkflows = await this.workflowRepo.findByProjectId(projectId, undefined, tx);
      const workflowIds = projectWorkflows.map(w => w.id);
      if (workflowIds.length > 0) {
        // Bulk-update every workflow in one round trip (mirrors the
        // workflowRuns update below, instead of one query per workflow).
        await tx
          .update(workflows)
          .set({
            ownerType: targetOwnerType,
            ownerUuid: targetOwnerUuid,
            updatedAt: new Date(),
          })
          .where(inArray(workflows.id, workflowIds));
        // Cascade ownership to all runs for these workflows
        await tx
          .update(workflowRuns)
          .set({
            ownerType: targetOwnerType,
            ownerUuid: targetOwnerUuid,
          })
          .where(inArray(workflowRuns.workflowId, workflowIds));
      }
      const linkedDatabaseRows = workflowIds.length > 0
        ? await tx
          .select({ id: workflowDataSources.dataSourceId })
          .from(workflowDataSources)
          .where(inArray(workflowDataSources.workflowId, workflowIds))
        : [];
      const databaseIds = new Set<string>(linkedDatabaseRows.map((row) => row.id));
      const scopedDatabases = await tx
        .select({ id: datavaultDatabases.id })
        .from(datavaultDatabases)
        .where(and(eq(datavaultDatabases.scopeType, 'project'), eq(datavaultDatabases.scopeId, projectId)));
      scopedDatabases.forEach((row) => databaseIds.add(row.id));
      if (workflowIds.length > 0) {
        const workflowScopedDatabases = await tx
          .select({ id: datavaultDatabases.id })
          .from(datavaultDatabases)
          .where(and(eq(datavaultDatabases.scopeType, 'workflow'), inArray(datavaultDatabases.scopeId, workflowIds)));
        workflowScopedDatabases.forEach((row) => databaseIds.add(row.id));
      }
      if (databaseIds.size > 0) {
        await tx
          .update(datavaultDatabases)
          .set({
            ownerType: targetOwnerType,
            ownerUuid: targetOwnerUuid,
            updatedAt: new Date(),
          })
          .where(inArray(datavaultDatabases.id, [...databaseIds]));
        await tx
          .update(datavaultTables)
          .set({
            ownerType: targetOwnerType,
            ownerUuid: targetOwnerUuid,
            updatedAt: new Date(),
          })
          .where(inArray(datavaultTables.databaseId, [...databaseIds]));
      }
      return updatedProject;
    });
  }
}
// Singleton instance
export const projectService = new ProjectService();
