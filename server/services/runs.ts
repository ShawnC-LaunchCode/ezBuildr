import { eq } from 'drizzle-orm';

import * as schema from '@shared/schema';
import type { InsertRun, InsertRunLog } from '@shared/schema';

import { db } from '../db';
import { logger } from '../logger';
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
    logger.error({ error }, 'Failed to create run');
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
    status?: 'pending' | 'success' | 'error' | 'waiting_review' | 'waiting_signature';
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
    logger.error({ error }, 'Failed to update run');
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
    logger.error({ error }, 'Failed to create run log');
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
    return await db.insert(schema.runLogs).values(data).returning();
  } catch (error) {
    logger.error({ error }, 'Failed to create run logs');
    throw createError.database('Failed to create run logs');
  }
}

/**
 * Get run by ID
 */
export async function getRunById(runId: string) {
  try {
    return await db.query.runs.findFirst({
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
  } catch (error) {
    logger.error({ error }, 'Failed to get run');
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
    return await db.query.runLogs.findMany({
      where: eq(schema.runLogs.runId, runId),
      orderBy: (runLogs: any, { desc }: any) => [desc(runLogs.createdAt)],
      limit: options.limit || 100,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get run logs');
    throw createError.database('Failed to get run logs');
  }
}

/**
 * Resume workflow execution from a specific node
 * Stage 14: Used when review/signature gates are completed
 *
 * This function continues workflow execution after a waiting state
 * (e.g., after review approval or document signing).
 *
 * @param runId - Run ID to resume
 * @param nodeId - Node ID that was waiting (review/esign node)
 * @returns Updated run
 */
export async function resumeRunFromNode(
  runId: string,
  nodeId: string
) {
  try {
    // Get the run with its workflow version
    const run = await getRunById(runId);
    if (!run) {
      throw createError.notFound('Run', runId);
    }

    // Verify run is in a waiting state
    if (run.status !== 'waiting_review' && run.status !== 'waiting_signature') {
      throw createError.validation(
        `Run is not in a waiting state (current status: ${run.status})`
      );
    }

    // Log the resumption
    await createRunLog({
      runId,
      nodeId,
      level: 'info',
      message: `Resuming workflow execution from node ${nodeId}`,
      context: { nodeId, previousStatus: run.status },
    });

    // Parse the graph JSON to find the next nodes
    const graphJson = run.workflowVersion?.graphJson as any;
    if (!graphJson?.nodes || !graphJson.edges) {
      throw createError.validation('Invalid workflow graph JSON');
    }

    // Find outgoing edges from the current node to determine next steps
    const nextEdges = graphJson.edges.filter((edge: any) => edge.source === nodeId);

    // For now, we'll mark the run as success if there are no more nodes
    // In a full implementation, we would:
    // 1. Continue executing nodes from the next edge
    // 2. Handle branching logic
    // 3. Process template/HTTP nodes
    // 4. Update output refs
    //
    // This is a simplified implementation for Stage 14 MVP
    if (nextEdges.length === 0) {
      // No more nodes to execute - mark as success
      return await updateRun(runId, {
        status: 'success',
        durationMs: Date.now() - (run.createdAt ? new Date(run.createdAt).getTime() : 0),
      } as any);
    } else {
      // There are more nodes - for MVP, just mark as success
      // TODO: Implement full graph traversal and execution
      logger.warn({ runId, nodeId, nextEdges: nextEdges.map((e: any) => e.target) }, 'Resume run: Graph continuation not implemented');

      // For now, fail the run to avoid false success
      throw createError.internal('Workflow resumption not fully implemented (graph execution paused)');


    }
  } catch (error) {
    logger.error({ error }, 'Failed to resume run');

    // Log the error
    try {
      await createRunLog({
        runId,
        nodeId,
        level: 'error',
        message: `Failed to resume workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } catch (logError) {
      logger.error({ error: logError }, 'Failed to log resume error');
    }

    throw error;
  }
}
