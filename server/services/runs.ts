import { eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';
import type { InsertRun, InsertRunLog } from '@shared/schema';
import { createError } from '../utils/errors';

/**
 * Runs Service
 * Helpers for creating and managing workflow runs
 */

/**
 * Create a new run record
 */
export async function createRun(data: InsertRun): Promise<schema.Run> {
  try {
    const [run] = await db.insert(schema.runs).values(data).returning();
    return run;
  } catch (error) {
    console.error('Failed to create run:', error);
    throw createError.database('Failed to create run');
  }
}

/**
 * Update run status and results
 * Stage 8: Added trace and error fields
 */
export async function updateRun(
  runId: string,
  updates: {
    status?: 'pending' | 'success' | 'error';
    outputRefs?: Record<string, any>;
    trace?: any; // Stage 8: Execution trace
    error?: string | null; // Stage 8: Error message
    durationMs?: number;
  }
): Promise<schema.Run> {
  try {
    const [run] = await db
      .update(schema.runs)
      .set(updates)
      .where(eq(schema.runs.id, runId))
      .returning();

    if (!run) {
      throw createError.notFound('Run', runId);
    }

    return run;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    console.error('Failed to update run:', error);
    throw createError.database('Failed to update run');
  }
}

/**
 * Create run log entry
 */
export async function createRunLog(data: InsertRunLog): Promise<schema.RunLog> {
  try {
    const [log] = await db.insert(schema.runLogs).values(data).returning();
    return log;
  } catch (error) {
    console.error('Failed to create run log:', error);
    throw createError.database('Failed to create run log');
  }
}

/**
 * Create multiple run log entries
 */
export async function createRunLogs(data: InsertRunLog[]): Promise<schema.RunLog[]> {
  if (data.length === 0) {
    return [];
  }

  try {
    const logs = await db.insert(schema.runLogs).values(data).returning();
    return logs;
  } catch (error) {
    console.error('Failed to create run logs:', error);
    throw createError.database('Failed to create run logs');
  }
}

/**
 * Get run by ID
 */
export async function getRunById(runId: string): Promise<schema.Run | undefined> {
  try {
    const run = await db.query.runs.findFirst({
      where: eq(schema.runs.id, runId),
      with: {
        workflowVersion: {
          with: {
            workflow: true,
          },
        },
        createdByUser: {
          columns: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });
    return run;
  } catch (error) {
    console.error('Failed to get run:', error);
    throw createError.database('Failed to get run');
  }
}

/**
 * Get run logs for a run
 */
export async function getRunLogs(
  runId: string,
  options: {
    limit?: number;
    cursor?: string;
  } = {}
): Promise<schema.RunLog[]> {
  try {
    const logs = await db.query.runLogs.findMany({
      where: eq(schema.runLogs.runId, runId),
      orderBy: (runLogs, { desc }) => [desc(runLogs.createdAt)],
      limit: options.limit || 100,
    });
    return logs;
  } catch (error) {
    console.error('Failed to get run logs:', error);
    throw createError.database('Failed to get run logs');
  }
}
