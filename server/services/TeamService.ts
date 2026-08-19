import type { Team, TeamMember, TeamRole } from "@shared/schema";

import {
  teamRepository,
  teamMemberRepository,
  userRepository,
  type DbTransaction,
} from "../repositories";
import { withCurrentTenant } from "../utils/rlsContext";

/**
 * Service layer for team-related business logic
 *
 * RLS-2d: VARIANT 1 (§2c) — no method here takes an explicit `tenantId`
 * argument; a team's tenant is derived from the team row itself
 * (`verifyTeamTenantAccess` compares it against the acting user's own
 * `tenantId`), so there is nothing to cross-check the ambient tenant
 * against. `withTx` is the two-argument form: reuse a caller-supplied `tx`,
 * otherwise open exactly one via `withCurrentTenant`. All three repositories
 * already threaded `tx` through `BaseRepository.getDb(tx)` before this
 * ticket — no repository changes were needed.
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
    this.teamRepo = teamRepo ?? teamRepository;
    this.teamMemberRepo = teamMemberRepo ?? teamMemberRepository;
    this.userRepo = userRepo ?? userRepository;
  }

  /**
   * Run `fn` inside a tenant-scoped transaction opened at this service
   * boundary (RLS-2d, copying RLS-2a's `withTx` shape — see
   * docs/architecture/TENANT_ISOLATION_RLS.md §2b/§2c). Reuses a
   * caller-supplied `tx` if given; otherwise opens exactly one via
   * `withCurrentTenant`.
   */
  private async withTx<T>(
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    return withCurrentTenant(fn);
  }

  /**
   * Verify user belongs to the same tenant as the team
   */
  private async verifyTeamTenantAccess(teamId: string, userId: string, tx?: DbTransaction): Promise<Team> {
    const team = await this.teamRepo.findById(teamId, tx);
    if (!team) {throw new Error("Team not found");}

    const user = await this.userRepo.findById(userId, tx);
    if (!user || user.tenantId !== team.tenantId) {
      throw new Error("Access denied - team belongs to a different tenant");
    }
    
    return team;
  }

  /**
   * Create a new team (creator automatically becomes admin)
   */
  async createTeam(data: { name: string }, creatorId: string, tx?: DbTransaction): Promise<Team> {
    return this.withTx(tx, async (tx) => {
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
    });
  }

  /**
   * Get all teams a user has access to (as member or admin)
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getUserTeams(userId: string, tx?: DbTransaction) {
    return this.withTx(tx, (tx) => this.teamRepo.findByUserId(userId, tx));
  }

  /**
   * Get team by ID with members
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getTeamWithMembers(teamId: string, userId: string, tx?: DbTransaction) {
    return this.withTx(tx, async (tx) => {
      // Verify tenant scoping
      const team = await this.verifyTeamTenantAccess(teamId, userId, tx);

      // Verify user is a member of this team
      const membership = await this.teamMemberRepo.findByTeamAndUser(teamId, userId, tx);
      if (!membership) {
        throw new Error("Access denied - you are not a member of this team");
      }

      // Get all members with user details (batch fetch users to avoid N+1)
      const members = await this.teamMemberRepo.findByTeamId(teamId, tx);
      const userIds = members.map(m => m.userId);
      const userList = await this.userRepo.findByIds(userIds, tx);
      const userMap = new Map(userList.map(u => [u.id, u]));
      const membersWithDetails = members.map(member => {
        const user = userMap.get(member.userId);
        return {
          ...member,
          user: user ? {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          } : null,
        };
      });

      return {
        ...team,
        members: membersWithDetails,
      };
    });
  }

  /**
   * Check if user is a team admin
   */
  async isTeamAdmin(teamId: string, userId: string, tx?: DbTransaction): Promise<boolean> {
    return this.withTx(tx, async (tx) => {
      const member = await this.teamMemberRepo.findByTeamAndUser(teamId, userId, tx);
      return member?.role === "admin";
    });
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
    return this.withTx(tx, async (tx) => {
      // Verify tenant scoping for requestor
      const team = await this.verifyTeamTenantAccess(teamId, requestorId, tx);

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

      // Verify target user belongs to the same tenant
      if (targetUser.tenantId !== team.tenantId) {
        throw new Error("Cannot add user from a different tenant");
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
    });
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
    await this.withTx(tx, async (tx) => {
      // Verify tenant scoping for requestor
      await this.verifyTeamTenantAccess(teamId, requestorId, tx);

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
    });
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
    return this.withTx(tx, async (tx) => {
      // Verify tenant scoping
      await this.verifyTeamTenantAccess(teamId, userId, tx);

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
    });
  }

  /**
   * Delete a team (admin only)
   */
  async deleteTeam(teamId: string, userId: string, tx?: DbTransaction): Promise<void> {
    await this.withTx(tx, async (tx) => {
      // Verify tenant scoping
      await this.verifyTeamTenantAccess(teamId, userId, tx);

      // Verify user is a team admin
      const isAdmin = await this.isTeamAdmin(teamId, userId, tx);
      if (!isAdmin) {
        throw new Error("Access denied - team admin access required");
      }

      await this.teamRepo.delete(teamId, tx);
    });
  }
}

// Export singleton instance
export const teamService = new TeamService();
