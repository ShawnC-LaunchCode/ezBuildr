import {
  projectRepository,
  workflowRepository,
  type DbTransaction,
} from "../repositories";
import type { Project, InsertProject, Workflow } from "@shared/schema";

/**
 * Service layer for project-related business logic
 */
export class ProjectService {
  private projectRepo: typeof projectRepository;
  private workflowRepo: typeof workflowRepository;

  constructor(
    projectRepo?: typeof projectRepository,
    workflowRepo?: typeof workflowRepository
  ) {
    this.projectRepo = projectRepo || projectRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
  }

  /**
   * Verify user owns the project
   */
  async verifyOwnership(projectId: string, userId: string): Promise<Project> {
    const project = await this.projectRepo.findById(projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.creatorId !== userId) {
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
      creatorId,
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
    return await this.projectRepo.update(projectId, {
      ...data,
      updatedAt: new Date(),
    });
  }

  /**
   * Archive project (soft delete)
   */
  async archiveProject(projectId: string, userId: string): Promise<Project> {
    await this.verifyOwnership(projectId, userId);
    return await this.projectRepo.update(projectId, {
      status: 'archived',
      updatedAt: new Date(),
    });
  }

  /**
   * Unarchive project
   */
  async unarchiveProject(projectId: string, userId: string): Promise<Project> {
    await this.verifyOwnership(projectId, userId);
    return await this.projectRepo.update(projectId, {
      status: 'active',
      updatedAt: new Date(),
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
}

// Singleton instance
export const projectService = new ProjectService();
