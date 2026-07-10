import type { Project, InsertProject, Workflow, ProjectAccess, PrincipalType, AccessRole } from "@shared/schema";

import {
  projectRepository,
  workflowRepository,
  projectAccessRepository,
  type DbTransaction,
} from "../repositories";
import { canCreateWithOwnership, canManageOrg, isOrgMember } from "../utils/ownershipAccess";

import { aclService } from "./AclService";
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
  async listProjects(creatorId: string): Promise<Project[]> {
    return this.projectRepo.findByCreatorId(creatorId);
  }
  /**
   * List active (non-archived) projects for a user
   */
  async listActiveProjects(creatorId: string): Promise<Project[]> {
    return this.projectRepo.findActiveByCreatorId(creatorId);
  }
  /**
   * List projects owned by a specific organization.
   */
  async listOrganizationProjects(orgId: string, userId: string, activeOnly = true): Promise<Project[]> {
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
    await this.verifyProjectAccess(projectId, userId, 'edit');
    return this.projectRepo.update(projectId, data);
  }
  /**
   * Archive project (soft delete)
   */
  async archiveProject(projectId: string, userId: string): Promise<Project> {
    await this.verifyProjectAccess(projectId, userId, 'edit');
    return this.projectRepo.update(projectId, {
      status: 'archived',
      archived: true,
    });
  }
  /**
   * Unarchive project
   */
  async unarchiveProject(projectId: string, userId: string): Promise<Project> {
    await this.verifyProjectAccess(projectId, userId, 'edit');
    return this.projectRepo.update(projectId, {
      status: 'active',
      archived: false,
    });
  }
  /**
   * Delete project (hard delete)
   * Note: Workflows will have their projectId set to null (on delete set null)
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    await this.verifyProjectAccess(projectId, userId, 'owner');
    await this.projectRepo.update(projectId, {
      status: 'archived',
      archived: true,
    });
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
    await this.verifyProjectAccess(projectId, userId, 'owner');
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
   * Transfer project ownership to another user
   * Only current owner can transfer ownership
   */
  async transferProjectOwnership(
    projectId: string,
    currentOwnerId: string,
    newOwnerId: string,
    tx?: DbTransaction
  ): Promise<Project> {
    await this.verifyProjectAccess(projectId, currentOwnerId, 'owner');
    return this.projectRepo.update(
      projectId,
      {
        ownerId: newOwnerId,
      },
      tx
    );
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
    const { transferService } = await import('./TransferService');
    const { workflowRuns } = await import('@shared/schema');
    const { inArray } = await import('drizzle-orm');
    const { db } = await import('../db');
    const project = await this.verifyProjectAccess(projectId, userId, 'owner');
    if (targetOwnerType === 'org' && !(await canManageOrg(userId, targetOwnerUuid))) {
      throw new Error('Access denied: Organization admin role required to transfer projects to this organization');
    }
    // Validate transfer permissions
    await transferService.validateTransfer(
      userId,
      project.ownerType ?? 'user',
      project.ownerUuid ?? project.ownerId ?? project.createdBy ?? project.creatorId,
      targetOwnerType,
      targetOwnerUuid
    );
    // Update project ownership and cascade to workflows
    const updatedProject = await this.projectRepo.update(projectId, {
      ownerType: targetOwnerType,
      ownerUuid: targetOwnerUuid,
    });
    // Cascade: Transfer all child workflows to same owner
    const workflows = await this.workflowRepo.findByProjectId(projectId);
    const workflowIds = workflows.map(w => w.id);
    if (workflowIds.length > 0) {
      // Update workflows
      for (const workflow of workflows) {
        await this.workflowRepo.update(workflow.id, {
          ownerType: targetOwnerType,
          ownerUuid: targetOwnerUuid,
        });
      }
      // FIX #1: Cascade ownership to all runs for these workflows
      await db
        .update(workflowRuns)
        .set({
          ownerType: targetOwnerType,
          ownerUuid: targetOwnerUuid,
        })
        .where(inArray(workflowRuns.workflowId, workflowIds));
    }
    return updatedProject;
  }
}
// Singleton instance
export const projectService = new ProjectService();
