import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { systemStats } from "@shared/schema";
import type { SystemStats } from "@shared/schema";

/**
 * Repository for system-wide statistics
 * Maintains historical counters for surveys and responses
 */
export class SystemStatsRepository {
  /**
   * Get or initialize system stats
   * Creates the stats row if it doesn't exist
   */
  async getOrInitialize(): Promise<SystemStats> {
    let stats = await db.select().from(systemStats).where(eq(systemStats.id, 1)).limit(1);

    if (stats.length === 0) {
      // Initialize stats row
      await db.insert(systemStats).values({
        id: 1,
        totalSurveysCreated: 0,
        totalSurveysDeleted: 0,
        totalResponsesCollected: 0,
        totalResponsesDeleted: 0,
        updatedAt: new Date(),
      });

      stats = await db.select().from(systemStats).where(eq(systemStats.id, 1)).limit(1);
    }

    return stats[0];
  }

  /**
   * Increment surveys created counter
   */
  async incrementSurveysCreated(count: number = 1): Promise<void> {
    await this.getOrInitialize(); // Ensure row exists

    await db
      .update(systemStats)
      .set({
        totalSurveysCreated: sql`${systemStats.totalSurveysCreated} + ${count}`,
        updatedAt: new Date(),
      })
      .where(eq(systemStats.id, 1));
  }

  /**
   * Increment surveys deleted counter
   * Also counts the responses that were deleted with the survey
   */
  async incrementSurveysDeleted(surveyCount: number = 1, responseCount: number = 0): Promise<void> {
    await this.getOrInitialize(); // Ensure row exists

    await db
      .update(systemStats)
      .set({
        totalSurveysDeleted: sql`${systemStats.totalSurveysDeleted} + ${surveyCount}`,
        totalResponsesDeleted: sql`${systemStats.totalResponsesDeleted} + ${responseCount}`,
        updatedAt: new Date(),
      })
      .where(eq(systemStats.id, 1));
  }

  /**
   * Increment responses collected counter
   */
  async incrementResponsesCollected(count: number = 1): Promise<void> {
    await this.getOrInitialize(); // Ensure row exists

    await db
      .update(systemStats)
      .set({
        totalResponsesCollected: sql`${systemStats.totalResponsesCollected} + ${count}`,
        updatedAt: new Date(),
      })
      .where(eq(systemStats.id, 1));
  }

  /**
   * Increment responses deleted counter
   */
  async incrementResponsesDeleted(count: number = 1): Promise<void> {
    await this.getOrInitialize(); // Ensure row exists

    await db
      .update(systemStats)
      .set({
        totalResponsesDeleted: sql`${systemStats.totalResponsesDeleted} + ${count}`,
        updatedAt: new Date(),
      })
      .where(eq(systemStats.id, 1));
  }

  /**
   * Increment users created counter
   */
  async incrementUsersCreated(count: number = 1): Promise<void> {
    await this.getOrInitialize(); // Ensure row exists

    await db
      .update(systemStats)
      .set({
        totalUsersCreated: sql`${systemStats.totalUsersCreated} + ${count}`,
        updatedAt: new Date(),
      })
      .where(eq(systemStats.id, 1));
  }

  /**
   * Increment workflows created counter
   */
  async incrementWorkflowsCreated(count: number = 1): Promise<void> {
    await this.getOrInitialize(); // Ensure row exists

    await db
      .update(systemStats)
      .set({
        totalWorkflowsCreated: sql`${systemStats.totalWorkflowsCreated} + ${count}`,
        updatedAt: new Date(),
      })
      .where(eq(systemStats.id, 1));
  }

  /**
   * Get current stats
   */
  async getStats(): Promise<SystemStats> {
    return this.getOrInitialize();
  }
}

// Export singleton instance
export const systemStatsRepository = new SystemStatsRepository();
