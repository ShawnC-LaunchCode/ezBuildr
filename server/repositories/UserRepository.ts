import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { users, workflows, type User, type UpsertUser } from "@shared/schema";
import { db } from "../db";
import { eq, sql, count, getTableColumns } from "drizzle-orm";
import { logger } from "../logger";

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
  async upsert(userData: UpsertUser, tx?: DbTransaction): Promise<User> {
    const database = this.getDb(tx);

    try {
      // First, try to find existing user by email
      if (userData.email) {
        const existingUser = await this.findByEmail(userData.email, tx);

        if (existingUser) {
          // Update existing user with new data, but only update provided fields
          // This preserves fields like 'role' that aren't included in Google OAuth userData
          const updateData: any = {
            updatedAt: new Date(),
          };

          // Only include fields that are explicitly provided
          if (userData.firstName !== undefined) updateData.firstName = userData.firstName;
          if (userData.lastName !== undefined) updateData.lastName = userData.lastName;
          if (userData.profileImageUrl !== undefined) updateData.profileImageUrl = userData.profileImageUrl;
          // Update auth provider and verification status if provided (e.g. linking Google account)
          if (userData.authProvider) updateData.authProvider = userData.authProvider;
          if (userData.emailVerified !== undefined) updateData.emailVerified = userData.emailVerified;

          // Note: We intentionally don't update email or role here to preserve existing values

          const [updatedUser] = await database
            .update(users)
            .set(updateData)
            .where(eq(users.email, userData.email))
            .returning();
          return updatedUser;
        }
      }

      // If no existing user found, insert new user
      // Handle conflict on ID in case it's provided and already exists
      const [user] = await database
        .insert(users)
        .values(userData as any)
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
      return user;
    } catch (error) {
      // If we still get a constraint violation, it could be due to race conditions
      // Try to find the existing user again and update
      if (error instanceof Error && error.message.includes('duplicate key') && userData.email) {
        const existingUser = await this.findByEmail(userData.email, tx);

        if (existingUser) {
          // Only update provided fields to preserve existing role
          const updateData: any = {
            updatedAt: new Date(),
          };

          if (userData.firstName !== undefined) updateData.firstName = userData.firstName;
          if (userData.lastName !== undefined) updateData.lastName = userData.lastName;
          if (userData.profileImageUrl !== undefined) updateData.profileImageUrl = userData.profileImageUrl;

          const [updatedUser] = await database
            .update(users)
            .set(updateData)
            .where(eq(users.email, userData.email))
            .returning();
          return updatedUser;
        }
      }

      // If we can't handle the error, re-throw it
      throw error;
    }
  }

  /**
   * Get all users (admin only)
   */
  async findAllUsers(tx?: DbTransaction): Promise<User[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(users)
      .orderBy(users.createdAt);
  }

  /**
   * Get all users with their workflow count (admin only)
   * Optimized to use a single query with LEFT JOIN instead of fetching all workflows
   */
  async findAllUsersWithWorkflowCounts(tx?: DbTransaction): Promise<(User & { workflowCount: number })[]> {
    const database = this.getDb(tx);

    // Select all user columns plus the count of workflows
    const rows = await database
      .select({
        ...getTableColumns(users),
        workflowCount: count(workflows.id),
      })
      .from(users)
      .leftJoin(workflows, eq(users.id, workflows.creatorId))
      .groupBy(users.id)
      .orderBy(users.createdAt);

    return rows.map(row => ({
      ...row,
      workflowCount: Number(row.workflowCount)
    }));
  }

  /**
   * Get user statistics (admin only)
   * Optimized to use a single query instead of fetching all users
   */
  async getUserStats(tx?: DbTransaction) {
    const database = this.getDb(tx);
    const [stats] = await database
      .select({
        total: count(users.id),
        admins: sql<number>`sum(case when ${users.role} = 'admin' then 1 else 0 end)`,
        creators: sql<number>`sum(case when ${users.role} = 'creator' then 1 else 0 end)`,
      })
      .from(users);

    return {
      total: Number(stats?.total || 0),
      admins: Number(stats?.admins || 0),
      creators: Number(stats?.creators || 0),
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

    if (!updatedUser) {
      throw new Error('User not found');
    }

    return updatedUser;
  }

  /**
   * Update user fields
   */
  async updateUser(userId: string, data: Partial<User>, tx?: DbTransaction): Promise<User> {
    const database = this.getDb(tx);
    const updateData: any = { ...data, updatedAt: new Date() };

    // Remove undefined fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

    const [updatedUser] = await database
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      throw new Error('User not found');
    }

    return updatedUser;
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
