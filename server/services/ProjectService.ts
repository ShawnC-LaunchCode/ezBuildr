import {
  projectRepository,
  workflowRepository,
  projectAccessRepository,
  type DbTransaction,
} from "../repositories";
import type { Project, InsertProject, Workflow, ProjectAccess, PrincipalType } from "@shared/schema";

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
    this.projectRepo = projectRepo || projectRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
    this.projectAccessRepo = projectAccessRepo || projectAccessRepository;
  }

  /**
   * Verify user owns the project
   */
  async verifyOwnership(projectId: string, userId: string): Promise<Project> {
    const project = await this.projectRepo.findById(projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.createdBy !== userId) {
      throw new Error("Access denied - you do not own this project");
    }

    return project;
  }

  /**
   * Create a new project
   */
  async createProject(data: InsertProject, creatorId: string): Promise<Project> {
    return await this.projectRepo.create({
      ...data,
      createdBy: creatorId,
      ownerId: creatorId, // Creator is also the initial owner
      status: 'active',
    });
  }

  /**
   * Get project by ID with contained workflows
   */
  async getProjectWithWorkflows(projectId: string, userId: string) {
    const project = await this.verifyOwnership(projectId, userId);
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
    return await this.projectRepo.findByCreatorId(creatorId);
  }

  /**
   * List active (non-archived) projects for a user
   */
  async listActiveProjects(creatorId: string): Promise<Project[]> {
    return await this.projectRepo.findActiveByCreatorId(creatorId);
  }

  /**
   * Update project
   */
  async updateProject(
    projectId: string,
    userId: string,
    data: Partial<InsertProject>
  ): Promise<Project> {
    await this.verifyOwnership(projectId, userId);
    return await this.projectRepo.update(projectId, data);
  }

  /**
   * Archive project (soft delete)
   */
  async archiveProject(projectId: string, userId: string): Promise<Project> {
    await this.verifyOwnership(projectId, userId);
    return await this.projectRepo.update(projectId, {
      status: 'archived',
    });
  }

  /**
   * Unarchive project
   */
  async unarchiveProject(projectId: string, userId: string): Promise<Project> {
    await this.verifyOwnership(projectId, userId);
    return await this.projectRepo.update(projectId, {
      status: 'active',
    });
  }

  /**
   * Delete project (hard delete)
   * Note: Workflows will have their projectId set to null (on delete set null)
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    await this.verifyOwnership(projectId, userId);
    await this.projectRepo.delete(projectId);
  }

  /**
   * Get workflows in a project
   */
  async getProjectWorkflows(projectId: string, userId: string): Promise<Workflow[]> {
    await this.verifyOwnership(projectId, userId);
    return await this.workflowRepo.findByProjectId(projectId);
  }

  /**
   * Count workflows in a project
   */
  async countProjectWorkflows(projectId: string, userId: string): Promise<number> {
    await this.verifyOwnership(projectId, userId);
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
    await this.verifyOwnership(projectId, userId);
    return await this.projectAccessRepo.findByProjectId(projectId, tx);
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
    const project = await this.verifyOwnership(projectId, requestorId);

    const results: ProjectAccess[] = [];

    for (const entry of entries) {
      // Only owner can grant 'owner' role
      if (entry.role === 'owner' && project.ownerId !== requestorId) {
        throw new Error("Only the project owner can grant owner access to others");
      }

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
    await this.verifyOwnership(projectId, requestorId);

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
    const project = await this.verifyOwnership(projectId, currentOwnerId);

    if (project.ownerId !== currentOwnerId) {
      throw new Error("Only the current owner can transfer ownership");
    }

    return await this.projectRepo.update(
      projectId,
      {
        ownerId: newOwnerId,
      },
      tx
    );
  }
}

// Singleton instance
export const projectService = new ProjectService();
