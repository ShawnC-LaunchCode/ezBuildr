import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { transformBlocks, transformBlockRuns, type TransformBlock, type InsertTransformBlock, type TransformBlockRun, type InsertTransformBlockRun } from "@shared/schema";
import { eq, and, asc } from "drizzle-orm";
import { db } from "../db";

/**
 * Repository for transform block data access
 */
export class TransformBlockRepository extends BaseRepository<typeof transformBlocks, TransformBlock, InsertTransformBlock> {
  constructor(dbInstance?: typeof db) {
    super(transformBlocks, dbInstance);
  }

  /**
   * Find transform blocks by workflow ID, ordered by execution order
   */
  async findByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<TransformBlock[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(transformBlocks)
      .where(eq(transformBlocks.workflowId, workflowId))
      .orderBy(asc(transformBlocks.order));
  }

  /**
   * Find enabled transform blocks by workflow ID, ordered by execution order
   */
  async findEnabledByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<TransformBlock[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(transformBlocks)
      .where(and(eq(transformBlocks.workflowId, workflowId), eq(transformBlocks.enabled, true)))
      .orderBy(asc(transformBlocks.order));
  }

  /**
   * Delete transform blocks by workflow ID
   */
  async deleteByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<void> {
    const database = this.getDb(tx);
    await database
      .delete(transformBlocks)
      .where(eq(transformBlocks.workflowId, workflowId));
  }
}

/**
 * Repository for transform block run audit data
 */
export class TransformBlockRunRepository extends BaseRepository<typeof transformBlockRuns, TransformBlockRun, InsertTransformBlockRun> {
  constructor(dbInstance?: typeof db) {
    super(transformBlockRuns, dbInstance);
  }

  /**
   * Find transform block runs by run ID
   */
  async findByRunId(runId: string, tx?: DbTransaction): Promise<TransformBlockRun[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(transformBlockRuns)
      .where(eq(transformBlockRuns.runId, runId));
  }

  /**
   * Find transform block runs by block ID
   */
  async findByBlockId(blockId: string, tx?: DbTransaction): Promise<TransformBlockRun[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(transformBlockRuns)
      .where(eq(transformBlockRuns.blockId, blockId));
  }

  /**
   * Create a transform block run audit record
   */
  async createRun(data: InsertTransformBlockRun, tx?: DbTransaction): Promise<TransformBlockRun> {
    const database = this.getDb(tx);
    const [run] = await database
      .insert(transformBlockRuns)
      .values(data)
      .returning();
    return run;
  }

  /**
   * Update a transform block run with completion data
   */
  async completeRun(
    runId: string,
    data: {
      finishedAt: Date;
      status: "success" | "timeout" | "error";
      errorMessage?: string;
      outputSample?: Record<string, unknown> | string | number | boolean | null;
    },
    tx?: DbTransaction
  ): Promise<void> {
    const database = this.getDb(tx);
    await database
      .update(transformBlockRuns)
      .set(data)
      .where(eq(transformBlockRuns.id, runId));
  }
}

// Singleton instances
export const transformBlockRepository = new TransformBlockRepository();
export const transformBlockRunRepository = new TransformBlockRunRepository();
