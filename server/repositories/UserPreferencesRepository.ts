import { eq } from "drizzle-orm";

import { userPreferences, type UserPreferences, type InsertUserPreferences } from "@shared/schema";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for user preferences database operations
 * Handles personalization settings storage and retrieval
 */
export class UserPreferencesRepository extends BaseRepository<typeof userPreferences, UserPreferences, InsertUserPreferences> {
  constructor() {
    super(userPreferences);
  }

  /**
   * Find user preferences by user ID
   */
  async findByUserId(userId: string, tx?: DbTransaction): Promise<UserPreferences | undefined> {
    const database = this.getDb(tx);
    const [prefs] = await database
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    return prefs;
  }

  /**
   * Upsert user preferences (create or update based on userId)
   */
  async upsert(userId: string, settings: Record<string, any>, tx?: DbTransaction): Promise<UserPreferences> {
    const database = this.getDb(tx);

    const existing = await this.findByUserId(userId, tx);

    if (existing) {
      // Merge existing settings with new settings
      const existingSettings = (existing.settings as Record<string, any>) || {};
      const merged = { ...existingSettings, ...settings };

      const [updated] = await database
        .update(userPreferences)
        .set({
          settings: merged,
          updatedAt: new Date()
        })
        .where(eq(userPreferences.userId, userId))
        .returning();

      return updated;
    } else {
      // Create new preferences with default values merged with provided settings
      const defaultSettings = {
        celebrationEffects: true,
        darkMode: "system",
        aiHints: true,
      };

      const [created] = await database
        .insert(userPreferences)
        .values({
          userId,
          settings: { ...defaultSettings, ...settings }
        })
        .returning();

      return created;
    }
  }

  /**
   * Delete user preferences by user ID
   */
  async deleteByUserId(userId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(userPreferences)
      .where(eq(userPreferences.userId, userId));
  }
}

export const userPreferencesRepository = new UserPreferencesRepository();
