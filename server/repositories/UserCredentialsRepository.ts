import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { userCredentials, type UserCredentials, type InsertUserCredentials } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../logger";

const logger = createLogger({ module: 'user-credentials-repository' });

/**
 * Repository for user credentials (password management)
 * Handles local authentication credentials
 */
export class UserCredentialsRepository extends BaseRepository<typeof userCredentials, UserCredentials, InsertUserCredentials> {
  constructor() {
    super(userCredentials);
  }

  /**
   * Find credentials by user ID
   */
  async findByUserId(userId: string, tx?: DbTransaction): Promise<UserCredentials | undefined> {
    const database = this.getDb(tx);
    const [credentials] = await database
      .select()
      .from(userCredentials)
      .where(eq(userCredentials.userId, userId));
    return credentials;
  }

  /**
   * Create credentials for a user
   */
  async createCredentials(userId: string, passwordHash: string, tx?: DbTransaction): Promise<UserCredentials> {
    const database = this.getDb(tx);

    try {
      const [credentials] = await database
        .insert(userCredentials)
        .values({
          userId,
          passwordHash,
        })
        .returning();

      logger.info({ userId }, 'User credentials created');
      return credentials;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to create user credentials');
      throw error;
    }
  }

  /**
   * Update password hash for a user
   */
  async updatePassword(userId: string, passwordHash: string, tx?: DbTransaction): Promise<UserCredentials> {
    const database = this.getDb(tx);

    try {
      const [credentials] = await database
        .update(userCredentials)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(userCredentials.userId, userId))
        .returning();

      if (!credentials) {
        throw new Error('User credentials not found');
      }

      logger.info({ userId }, 'User password updated');
      return credentials;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to update user password');
      throw error;
    }
  }

  /**
   * Delete credentials for a user
   */
  async deleteCredentials(userId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);

    try {
      await database
        .delete(userCredentials)
        .where(eq(userCredentials.userId, userId));

      logger.info({ userId }, 'User credentials deleted');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to delete user credentials');
      throw error;
    }
  }

  /**
   * Check if user has credentials (i.e., uses local auth)
   */
  async hasCredentials(userId: string, tx?: DbTransaction): Promise<boolean> {
    const credentials = await this.findByUserId(userId, tx);
    return !!credentials;
  }
}

export const userCredentialsRepository = new UserCredentialsRepository();
