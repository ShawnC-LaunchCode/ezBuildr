import { eq, sql } from "drizzle-orm";

import { systemStats } from "@shared/schema";
import type { SystemStats } from "@shared/schema";

import { db } from "../db";

/**
 * Repository for system-wide statistics
 * Maintains lifetime counters for users and workflows
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
        totalUsersCreated: 0,
        totalWorkflowsCreated: 0,
        updatedAt: new Date(),
      });

      stats = await db.select().from(systemStats).where(eq(systemStats.id, 1)).limit(1);
    }

    if (stats[0] == null) {throw new Error("Failed to initialize system stats");}
    return stats[0];
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
