import { eq, and, desc, lt } from "drizzle-orm";

import {
  scriptExecutionLog,
  type ScriptExecutionLog,
  type InsertScriptExecutionLog,
} from "@shared/schema";

import { db } from "../db";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for script execution log data access
 */
export class ScriptExecutionLogRepository extends BaseRepository<
  typeof scriptExecutionLog,
  ScriptExecutionLog,
  InsertScriptExecutionLog
> {
  constructor(dbInstance?: typeof db) {
    super(scriptExecutionLog, dbInstance);
  }

  /**
   * Find script execution logs by run ID, ordered by creation time (newest first)
   */
  async findByRunId(runId: string, tx?: DbTransaction): Promise<ScriptExecutionLog[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(scriptExecutionLog)
      .where(eq(scriptExecutionLog.runId, runId))
      .orderBy(desc(scriptExecutionLog.createdAt));
  }

  /**
   * Find script execution logs by script type and ID
   */
  async findByScriptId(
    scriptType: string,
    scriptId: string,
    tx?: DbTransaction
  ): Promise<ScriptExecutionLog[]> {
    const database = this.getDb(tx);
    return database
      .select()
      .from(scriptExecutionLog)
      .where(
        and(
          eq(scriptExecutionLog.scriptType, scriptType),
          eq(scriptExecutionLog.scriptId, scriptId)
        )
      )
      .orderBy(desc(scriptExecutionLog.createdAt));
  }

  /**
   * Create a script execution log entry
   */
  async createLog(data: InsertScriptExecutionLog, tx?: DbTransaction): Promise<ScriptExecutionLog> {
    const database = this.getDb(tx);
    const [log] = await database
      .insert(scriptExecutionLog)
      .values(data)
      .returning();

    if (!log) {
      throw new Error("Failed to create script execution log");
    }

    return log;
  }

  /**
   * Delete logs by run ID
   */
  async deleteByRunId(runId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database.delete(scriptExecutionLog).where(eq(scriptExecutionLog.runId, runId));
  }

  /**
   * Delete old logs (older than specified date)
   */
  async deleteOlderThan(date: Date, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const result = await database
      .delete(scriptExecutionLog)
      .where(lt(scriptExecutionLog.createdAt, date))
      .returning();
    return result.length;
  }
}

// Singleton instance
export const scriptExecutionLogRepository = new ScriptExecutionLogRepository();
