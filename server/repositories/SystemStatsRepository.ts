import { eq, sql } from "drizzle-orm";

import { systemStats } from "@shared/schema";
import type { SystemStats } from "@shared/schema";

import { db } from "../db";
import type { DbTransaction } from "./BaseRepository";

/**
 * Repository for system-wide statistics
 * Maintains lifetime counters for users and workflows
 *
 * Every method accepts an optional transaction. Callers that increment stats
 * from within an open transaction MUST pass it: with a single-connection pool
 * (the test configuration), acquiring a second pool connection while the
 * transaction holds the only one deadlocks.
 */
export class SystemStatsRepository {
  private conn(tx?: DbTransaction) {
    return tx ?? db;
  }

  /**
   * Get or initialize system stats
   * Creates the stats row if it doesn't exist
   */
  async getOrInitialize(tx?: DbTransaction): Promise<SystemStats> {
    const conn = this.conn(tx);
    let stats = await conn.select().from(systemStats).where(eq(systemStats.id, 1)).limit(1);

    if (stats.length === 0) {
      // Initialize stats row
      await conn.insert(systemStats).values({
        id: 1,
        totalUsersCreated: 0,
        totalWorkflowsCreated: 0,
        updatedAt: new Date(),
      });

      stats = await conn.select().from(systemStats).where(eq(systemStats.id, 1)).limit(1);
    }

    if (stats[0] == null) {throw new Error("Failed to initialize system stats");}
    return stats[0];
  }

  /**
   * Increment users created counter
   */
  async incrementUsersCreated(count: number = 1, tx?: DbTransaction): Promise<void> {
    const conn = this.conn(tx);
    await this.getOrInitialize(tx); // Ensure row exists

    await conn
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
  async incrementWorkflowsCreated(count: number = 1, tx?: DbTransaction): Promise<void> {
    const conn = this.conn(tx);
    await this.getOrInitialize(tx); // Ensure row exists

    await conn
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
  async getStats(tx?: DbTransaction): Promise<SystemStats> {
    return this.getOrInitialize(tx);
  }
}

// Export singleton instance
export const systemStatsRepository = new SystemStatsRepository();
