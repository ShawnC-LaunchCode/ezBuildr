/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { eq, sql, count, getTableColumns, inArray } from "drizzle-orm";

import { users, workflows, type User, type UpsertUser } from "@shared/schema";

import { db } from "../db";
import { logger } from "../logger";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for user-related database operations
 * Handles Google OAuth user management
 */
export class UserRepository extends BaseRepository<typeof users, User, UpsertUser> {
  constructor() {
    super(users);
  }

  /**
   * Find user by email address
   */
  async findByEmail(email: string, tx?: DbTransaction): Promise<User | undefined> {
    const database = this.getDb(tx);
    const [user] = await database
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user;
  }

  /**
   * Upsert user (create or update based on email)
   * Used for Google OAuth authentication
   * IMPORTANT: Only updates fields provided in userData to preserve existing fields like 'role'
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity, complexity
  async upsert(userData: UpsertUser, tx?: DbTransaction): Promise<User> {
    const database = this.getDb(tx);

    try {
      // First, try to find existing user by email
      if (userData.email) {
        const existingUser = await this.findByEmail(userData.email, tx);

        if (existingUser) {
          // Update existing user with new data, but only update provided fields
          // This preserves fields like 'role' that aren't included in Google OAuth userData
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updateData: any = { // Dynamic update object for partial user data
            updatedAt: new Date(),
          };

          // Only include fields that are explicitly provided
          if (userData.firstName !== undefined) { updateData.firstName = userData.firstName; }
          if (userData.lastName !== undefined) { updateData.lastName = userData.lastName; }
          if (userData.profileImageUrl !== undefined) { updateData.profileImageUrl = userData.profileImageUrl; }
          // Update auth provider and verification status if provided (e.g. linking Google account)
          if (userData.authProvider) { updateData.authProvider = userData.authProvider; }
          if (userData.emailVerified !== undefined) { updateData.emailVerified = userData.emailVerified; }

          // DEV FIX: In development, force update tenantRole to 'owner' if provided
          // This ensures developers are not stuck as 'viewer'
          if (process.env.NODE_ENV === 'development' && userData.tenantRole === 'owner') {
            updateData.tenantRole = 'owner';
          }

          // Note: We intentionally don't update email or role here to preserve existing values

          const [updatedUser] = await database
            .update(users)
            .set(updateData)
            .where(eq(users.email, userData.email))
            .returning();
          if (updatedUser == null) {throw new Error("Failed to update user");}
          return updatedUser;
        }
      }

      // If no existing user found, insert new user
      // Handle conflict on ID in case it's provided and already exists
      const [user] = await database
        .insert(users)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values(userData as any) // Drizzle insert type assertion
        .onConflictDoUpdate({
          target: users.id,
          set: {
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            updatedAt: new Date(),
          },
        })
        .returning();

      // Legacy systemStats tracking removed (survey system deprecated Nov 2025)
      // systemStats table no longer exists in schema
      try {
        const { systemStatsRepository } = await import("./SystemStatsRepository");
        // Pass tx through: a pool-based increment would deadlock inside a
        // transaction under a single-connection pool (see SystemStatsRepository).
        await systemStatsRepository.incrementUsersCreated(1, tx);
      } catch (e) {
        logger.warn({ err: e }, "Failed to increment user stats");
      }

      if (user == null) {throw new Error("Failed to create user");}
      return user;
    } catch (error) {
      // If we still get a constraint violation, it could be due to race conditions
      // Try to find the existing user again and update
      if (error instanceof Error && error.message.includes('duplicate key') && userData.email) {
        const existingUser = await this.findByEmail(userData.email, tx);

        if (existingUser) {
          // Only update provided fields to preserve existing role
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updateData: any = { // Dynamic update object for partial user data
            updatedAt: new Date(),
          };

          if (userData.firstName !== undefined) { updateData.firstName = userData.firstName; }
          if (userData.lastName !== undefined) { updateData.lastName = userData.lastName; }
          if (userData.profileImageUrl !== undefined) { updateData.profileImageUrl = userData.profileImageUrl; }

          const [updatedUser] = await database
            .update(users)
            .set(updateData)
            .where(eq(users.email, userData.email))
            .returning();
          if (updatedUser == null) {throw new Error("Failed to update user");}
          return updatedUser;
        }
      }

      // If we can't handle the error, re-throw it
      throw error;
    }
  }

  /**
   * Find multiple users by IDs (batch fetch)
   */
  async findByIds(ids: string[], tx?: DbTransaction): Promise<User[]> {
    if (ids.length === 0) {return [];}
    const database = this.getDb(tx);
    return database.select().from(users).where(inArray(users.id, ids));
  }

  /**
   * Get all users (admin only)
   */
  async findAllUsers(tx?: DbTransaction) {
    const database = this.getDb(tx);
    return database
      .select({
        id: users.id,
        tenantId: users.tenantId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        mfaEnabled: users.mfaEnabled,
      })
      .from(users)
      .orderBy(users.createdAt);
  }

  /**
   * Get all users with their workflow count (admin only)
   * Optimized to use a single query with LEFT JOIN instead of fetching all workflows
   */
  async findAllUsersWithWorkflowCounts(tx?: DbTransaction) {
    const database = this.getDb(tx);

    // Select specific safe columns plus the count of workflows
    const rows = await database
      .select({
        id: users.id,
        tenantId: users.tenantId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        mfaEnabled: users.mfaEnabled,
        workflowCount: count(workflows.id),
        personalWorkflowCount: sql`SUM(CASE WHEN ${workflows.ownerType} = 'user' OR ${workflows.ownerType} IS NULL AND ${workflows.id} IS NOT NULL THEN 1 ELSE 0 END)`,
        orgWorkflowCount: sql`SUM(CASE WHEN ${workflows.ownerType} = 'org' THEN 1 ELSE 0 END)`,
      })
      .from(users)
      .leftJoin(workflows, eq(users.id, workflows.creatorId))
      .groupBy(users.id)
      .orderBy(users.createdAt);

    return rows.map(row => ({
      ...row,
      workflowCount: Number(row.workflowCount),
      personalWorkflowCount: Number(row.personalWorkflowCount || 0),
      orgWorkflowCount: Number(row.orgWorkflowCount || 0),
    }));
  }

  /**
   * Get user statistics (admin only)
   * Optimized to use a single query instead of fetching all users
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  async getUserStats(tx?: DbTransaction) {
    const database = this.getDb(tx);
    const { systemStatsRepository } = await import("./SystemStatsRepository");

    // Run queries in parallel
    const [stats, systemStats] = await Promise.all([
      database
        .select({
          admins: sql<number>`sum(case when ${users.role} = 'admin' then 1 else 0 end)`,
          creators: sql<number>`sum(case when ${users.role} = 'creator' then 1 else 0 end)`,
        })
        .from(users),
      systemStatsRepository.getStats()
    ]);

    return {
      total: systemStats.totalUsersCreated, // Use lifetime total
      active: Number(stats[0]?.admins ?? 0) + Number(stats[0]?.creators ?? 0), // Optional: tracked active users
      admins: Number(stats[0]?.admins ?? 0),
      creators: Number(stats[0]?.creators ?? 0),
    };
  }

  /**
   * Update user role (admin only)
   */
  async updateRole(userId: string, role: 'admin' | 'creator', tx?: DbTransaction): Promise<User> {
    const database = this.getDb(tx);
    const [updatedUser] = await database
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (updatedUser == null) {
      throw new Error('User not found');
    }

    return updatedUser;
  }

  /**
   * Update user fields
   */
  async updateUser(userId: string, data: Partial<User>, tx?: DbTransaction): Promise<User> {
    const database = this.getDb(tx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = { ...data, updatedAt: new Date() }; // Dynamic update object for flexible user fields

    // Remove undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    const [updatedUser] = await database
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    if (updatedUser == null) {
      throw new Error('User not found');
    }

    return updatedUser;
  }

  /**
   * Update user active status
   */
  async updateIsActive(userId: string, isActive: boolean, tx?: DbTransaction): Promise<User> {
    const database = this.getDb(tx);
    const [updatedUser] = await database
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    if (updatedUser == null) {
      throw new Error('User not found');
    }

    return updatedUser;
  }

  /**
   * Delete a user completely from the system
   */
  async deleteUser(userId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(users)
      .where(eq(users.id, userId));
  }

  /**
   * Check database connectivity
   */
  async ping(): Promise<boolean> {
    try {
      await db.execute(sql`SELECT 1`);
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Database ping failed');
      return false;
    }
  }
}

export const userRepository = new UserRepository();
