import { eq, and } from "drizzle-orm";

import { teams, teamMembers } from "@shared/schema";
import type { Team, InsertTeam, TeamMember, InsertTeamMember } from "@shared/schema";

import { db } from "../db";

import { BaseRepository } from "./BaseRepository";

import type { DbTransaction } from "./BaseRepository";



/**
 * Repository for Team operations
 */
export class TeamRepository extends BaseRepository<typeof teams, Team, InsertTeam> {
  constructor(dbInstance?: typeof db) {
    super(teams, dbInstance);
  }



  /**
   * Find all teams a user is a member of (including as creator)
   */
  async findByUserId(userId: string, tx?: DbTransaction): Promise<Array<Team & { memberRole: string }>> {
    const database = this.getDb(tx);

    const result = await database
      .select({
        id: teams.id,
        name: teams.name,
        tenantId: teams.tenantId, // Add tenantId instead of createdBy
        createdAt: teams.createdAt,
        updatedAt: teams.updatedAt,
        memberRole: teamMembers.role,
      })
      .from(teams)
      .innerJoin(teamMembers, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.userId, userId));

    return result as Array<Team & { memberRole: string }>;
  }
}

/**
 * Repository for TeamMember operations
 */
export class TeamMemberRepository extends BaseRepository<typeof teamMembers, TeamMember, InsertTeamMember> {
  constructor(dbInstance?: typeof db) {
    super(teamMembers, dbInstance);
  }

  /**
   * Find all members of a team
   */
  async findByTeamId(teamId: string, tx?: DbTransaction): Promise<TeamMember[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));
  }

  /**
   * Find a specific team member
   */
  async findByTeamAndUser(
    teamId: string,
    userId: string,
    tx?: DbTransaction
  ): Promise<TeamMember | undefined> {
    const database = this.getDb(tx);
    const [member] = await database
      .select()
      .from(teamMembers)
      .where(and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId)
      ));

    return member;
  }

  /**
   * Find all teams a user belongs to
   */
  async findByUserId(userId: string, tx?: DbTransaction): Promise<TeamMember[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));
  }

  /**
   * Delete a team member
   */
  async deleteByTeamAndUser(
    teamId: string,
    userId: string,
    tx?: DbTransaction
  ): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(teamMembers)
      .where(and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId)
      ));
  }

  /**
   * Update a team member's role
   */
  async updateRole(
    teamId: string,
    userId: string,
    role: string,
    tx?: DbTransaction
  ): Promise<TeamMember> {
    const database = this.getDb(tx);
    const [updated] = await database
      .update(teamMembers)
      .set({ role })
      .where(and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId)
      ))
      .returning();

    return updated;
  }
}

// Export singleton instances
export const teamRepository = new TeamRepository();
export const teamMemberRepository = new TeamMemberRepository();
