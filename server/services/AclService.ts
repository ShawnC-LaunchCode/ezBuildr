import type { AccessRole } from "@shared/schema";

import {
  teamMemberRepository,
  projectAccessRepository,
  workflowAccessRepository,
  projectRepository,
  workflowRepository,
  type DbTransaction,
} from "../repositories";
import { canManageOrg, isOrgMember } from "../utils/ownershipAccess";

/**
 * Service for Access Control List (ACL) resolution
 * Handles permission checking for projects and workflows
 */
export class AclService {
  private teamMemberRepo: typeof teamMemberRepository;
  private projectAccessRepo: typeof projectAccessRepository;
  private workflowAccessRepo: typeof workflowAccessRepository;
  private projectRepo: typeof projectRepository;
  private workflowRepo: typeof workflowRepository;

  constructor(
    teamMemberRepo?: typeof teamMemberRepository,
    projectAccessRepo?: typeof projectAccessRepository,
    workflowAccessRepo?: typeof workflowAccessRepository,
    projectRepo?: typeof projectRepository,
    workflowRepo?: typeof workflowRepository
  ) {
    this.teamMemberRepo = teamMemberRepo ?? teamMemberRepository;
    this.projectAccessRepo = projectAccessRepo ?? projectAccessRepository;
    this.workflowAccessRepo = workflowAccessRepo ?? workflowAccessRepository;
    this.projectRepo = projectRepo ?? projectRepository;
    this.workflowRepo = workflowRepo ?? workflowRepository;
  }

  /**
   * Get all team IDs that a user is a member of
   */
  async getUserTeamIds(userId: string, tx?: DbTransaction): Promise<string[]> {
    const memberships = await this.teamMemberRepo.findByUserId(userId, tx);
    return memberships.map((m) => m.teamId);
  }

  /**
   * Compare and return the highest role
   * Precedence: owner > edit > view > none
   */
  private getHighestRole(role1: AccessRole, role2: AccessRole): AccessRole {
    const rolePrecedence: Record<AccessRole, number> = {
      owner: 4,
      edit: 3,
      view: 2,
      none: 1,
    };

    return rolePrecedence[role1] > rolePrecedence[role2] ? role1 : role2;
  }

  /**
   * Resolve user's role for a project
   * Returns: 'owner' | 'edit' | 'view' | 'none'
   *
   * Resolution order:
   * 1. Check ownership fields and legacy owner fields
   * 2. Org-owned projects grant view to members and owner to org admins
   * 3. Check direct user ACL entry
   * 4. Check team ACL entries (highest wins)
   * 5. Default → 'none'
   */
  async resolveRoleForProject(
    userId: string,
    projectId: string,
    tx?: DbTransaction
  ): Promise<AccessRole> {
    // 1. Check if user is the owner
    const project = await this.projectRepo.findById(projectId, tx);
    if (!project) {
      return "none";
    }

    let highestRole: AccessRole = "none";

    if (
      project.ownerId === userId ||
      project.createdBy === userId ||
      project.creatorId === userId ||
      (project.ownerType === "user" && project.ownerUuid === userId)
    ) {
      highestRole = "owner";
    }

    if (project.ownerType === "org" && project.ownerUuid) {
      if (await canManageOrg(userId, project.ownerUuid, tx)) {
        highestRole = this.getHighestRole(highestRole, "owner");
      } else if (await isOrgMember(userId, project.ownerUuid, tx)) {
        highestRole = this.getHighestRole(highestRole, "view");
      }
    }

    // 2. Check direct user ACL entry
    const userAcl = await this.projectAccessRepo.findByProjectAndUser(
      projectId,
      userId,
      tx
    );

    if (userAcl) {
      highestRole = this.getHighestRole(highestRole, userAcl.role as AccessRole);
    }

    // 3. Check team ACL entries
    const teamIds = await this.getUserTeamIds(userId, tx);
    if (teamIds.length > 0) {
      const teamAcls = await this.projectAccessRepo.findByProjectAndTeams(
        projectId,
        teamIds,
        tx
      );

      for (const acl of teamAcls) {
        highestRole = this.getHighestRole(highestRole, acl.role as AccessRole);
      }
    }

    return highestRole;
  }

  /**
   * Resolve user's role for a workflow
   * Returns: 'owner' | 'edit' | 'view' | 'none'
   *
   * Resolution order:
   * 1. Check ownership fields and legacy owner fields
   * 2. Org-owned workflows grant view to members and owner to org admins
   * 3. Check direct workflow ACL for user
   * 4. Check team ACL for workflow
   * 5. Merge project ACL if workflow belongs to a project
   */
  async resolveRoleForWorkflow(
    userId: string,
    workflowId: string,
    tx?: DbTransaction
  ): Promise<AccessRole> {
    // 1. Check if user is the owner
    const workflow = await this.workflowRepo.findById(workflowId, tx);
    if (!workflow) {
      return "none";
    }

    let highestRole: AccessRole = "none";

    if (
      workflow.ownerId === userId ||
      workflow.creatorId === userId ||
      (workflow.ownerType === "user" && workflow.ownerUuid === userId)
    ) {
      highestRole = "owner";
    }

    if (workflow.ownerType === "org" && workflow.ownerUuid) {
      if (await canManageOrg(userId, workflow.ownerUuid, tx)) {
        highestRole = this.getHighestRole(highestRole, "owner");
      } else if (await isOrgMember(userId, workflow.ownerUuid, tx)) {
        highestRole = this.getHighestRole(highestRole, "view");
      }
    }

    // 2. Check direct user ACL entry for workflow
    const userWorkflowAcl = await this.workflowAccessRepo.findByWorkflowAndUser(
      workflowId,
      userId,
      tx
    );

    if (userWorkflowAcl) {
      highestRole = this.getHighestRole(
        highestRole,
        userWorkflowAcl.role as AccessRole
      );
    }

    // 3. Check team ACL entries for workflow
    const teamIds = await this.getUserTeamIds(userId, tx);
    if (teamIds.length > 0) {
      const teamWorkflowAcls =
        await this.workflowAccessRepo.findByWorkflowAndTeams(
          workflowId,
          teamIds,
          tx
        );

      for (const acl of teamWorkflowAcls) {
        highestRole = this.getHighestRole(highestRole, acl.role as AccessRole);
      }
    }

    // 4. Project roles apply to contained workflows. Highest role wins.
    if (workflow.projectId) {
      const projectRole = await this.resolveRoleForProject(
        userId,
        workflow.projectId,
        tx
      );
      highestRole = this.getHighestRole(highestRole, projectRole);
    }

    return highestRole;
  }

  /**
   * Check if user has at least the minimum required role for a project
   */
  async hasProjectRole(
    userId: string,
    projectId: string,
    minRole: Exclude<AccessRole, "none">,
    tx?: DbTransaction
  ): Promise<boolean> {
    const userRole = await this.resolveRoleForProject(userId, projectId, tx);
    return this.hasMinimumRole(userRole, minRole);
  }

  /**
   * Check if user has at least the minimum required role for a workflow
   */
  async hasWorkflowRole(
    userId: string,
    workflowId: string,
    minRole: Exclude<AccessRole, "none">,
    tx?: DbTransaction
  ): Promise<boolean> {
    const userRole = await this.resolveRoleForWorkflow(userId, workflowId, tx);
    return this.hasMinimumRole(userRole, minRole);
  }

  /**
   * Check if a role meets the minimum requirement
   */
  private hasMinimumRole(
    userRole: AccessRole,
    minRole: Exclude<AccessRole, "none">
  ): boolean {
    const rolePrecedence: Record<AccessRole, number> = {
      owner: 4,
      edit: 3,
      view: 2,
      none: 1,
    };

    return rolePrecedence[userRole] >= rolePrecedence[minRole];
  }
}

// Export singleton instance
export const aclService = new AclService();
