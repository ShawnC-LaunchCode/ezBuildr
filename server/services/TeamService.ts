import type { Team, InsertTeam, TeamMember, InsertTeamMember, TeamRole } from "@shared/schema";

import {
  teamRepository,
  teamMemberRepository,
  userRepository,
  type DbTransaction,
} from "../repositories";

/**
 * Service layer for team-related business logic
 */
export class TeamService {
  private teamRepo: typeof teamRepository;
  private teamMemberRepo: typeof teamMemberRepository;
  private userRepo: typeof userRepository;

  constructor(
    teamRepo?: typeof teamRepository,
    teamMemberRepo?: typeof teamMemberRepository,
    userRepo?: typeof userRepository
  ) {
    this.teamRepo = teamRepo || teamRepository;
    this.teamMemberRepo = teamMemberRepo || teamMemberRepository;
    this.userRepo = userRepo || userRepository;
  }

  /**
   * Create a new team (creator automatically becomes admin)
   */
  async createTeam(data: { name: string }, creatorId: string, tx?: DbTransaction): Promise<Team> {
    // Get creator's tenant context
    const creator = await this.userRepo.findById(creatorId, tx);
    if (!creator?.tenantId) {
      throw new Error("Creator does not belong to a tenant");
    }

    const team = await this.teamRepo.create(
      {
        name: data.name,
        tenantId: creator.tenantId,
      },
      tx
    );

    // Add creator as team admin
    await this.teamMemberRepo.create(
      {
        teamId: team.id,
        userId: creatorId,
        role: "admin",
      },
      tx
    );

    return team;
  }

  /**
   * Get all teams a user has access to (as member or admin)
   */
  async getUserTeams(userId: string, tx?: DbTransaction) {
    return this.teamRepo.findByUserId(userId, tx);
  }

  /**
   * Get team by ID with members
   */
  async getTeamWithMembers(teamId: string, userId: string, tx?: DbTransaction) {
    const team = await this.teamRepo.findById(teamId, tx);

    if (!team) {
      throw new Error("Team not found");
    }

    // Verify user is a member of this team
    const membership = await this.teamMemberRepo.findByTeamAndUser(teamId, userId, tx);
    if (!membership) {
      throw new Error("Access denied - you are not a member of this team");
    }

    // Get all members with user details
    const members = await this.teamMemberRepo.findByTeamId(teamId, tx);
    const membersWithDetails = await Promise.all(
      members.map(async (member) => {
        const user = await this.userRepo.findById(member.userId, tx);
        return {
          ...member,
          user: user ? {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          } : null,
        };
      })
    );

    return {
      ...team,
      members: membersWithDetails,
    };
  }

  /**
   * Check if user is a team admin
   */
  async isTeamAdmin(teamId: string, userId: string, tx?: DbTransaction): Promise<boolean> {
    const member = await this.teamMemberRepo.findByTeamAndUser(teamId, userId, tx);
    return member?.role === "admin";
  }

  /**
   * Add or update a team member (admin only)
   */
  async addOrUpdateMember(
    teamId: string,
    requestorId: string,
    data: { userId: string; role: TeamRole },
    tx?: DbTransaction
  ): Promise<TeamMember> {
    // Verify requestor is a team admin
    const isAdmin = await this.isTeamAdmin(teamId, requestorId, tx);
    if (!isAdmin) {
      throw new Error("Access denied - team admin access required");
    }

    // Verify target user exists
    const targetUser = await this.userRepo.findById(data.userId, tx);
    if (!targetUser) {
      throw new Error("User not found");
    }

    // Check if member already exists
    const existingMember = await this.teamMemberRepo.findByTeamAndUser(
      teamId,
      data.userId,
      tx
    );

    if (existingMember) {
      // Update existing member's role
      return this.teamMemberRepo.updateRole(teamId, data.userId, data.role, tx);
    } else {
      // Add new member
      return this.teamMemberRepo.create(
        {
          teamId,
          userId: data.userId,
          role: data.role,
        },
        tx
      );
    }
  }

  /**
   * Remove a team member (admin only)
   */
  async removeMember(
    teamId: string,
    requestorId: string,
    targetUserId: string,
    tx?: DbTransaction
  ): Promise<void> {
    // Verify requestor is a team admin
    const isAdmin = await this.isTeamAdmin(teamId, requestorId, tx);
    if (!isAdmin) {
      throw new Error("Access denied - team admin access required");
    }

    // Don't allow removing yourself if you're the only admin
    if (requestorId === targetUserId) {
      const members = await this.teamMemberRepo.findByTeamId(teamId, tx);
      const adminCount = members.filter((m) => m.role === "admin").length;

      if (adminCount <= 1) {
        throw new Error("Cannot remove the last admin from the team");
      }
    }

    await this.teamMemberRepo.deleteByTeamAndUser(teamId, targetUserId, tx);
  }

  /**
   * Update team details (admin only)
   */
  async updateTeam(
    teamId: string,
    userId: string,
    data: { name: string },
    tx?: DbTransaction
  ): Promise<Team> {
    // Verify user is a team admin
    const isAdmin = await this.isTeamAdmin(teamId, userId, tx);
    if (!isAdmin) {
      throw new Error("Access denied - team admin access required");
    }

    return this.teamRepo.update(
      teamId,
      {
        name: data.name,
      },
      tx
    );
  }

  /**
   * Delete a team (admin only)
   */
  async deleteTeam(teamId: string, userId: string, tx?: DbTransaction): Promise<void> {
    // Verify user is a team admin
    const isAdmin = await this.isTeamAdmin(teamId, userId, tx);
    if (!isAdmin) {
      throw new Error("Access denied - team admin access required");
    }

    await this.teamRepo.delete(teamId, tx);
  }
}

// Export singleton instance
export const teamService = new TeamService();
