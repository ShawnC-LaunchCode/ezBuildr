import { BaseRepository, type DbTransaction } from "./BaseRepository";
import { blocks, type Block, type InsertBlock } from "@shared/schema";
import { eq, and, asc } from "drizzle-orm";
import { db } from "../db";
import type { BlockPhase } from "@shared/types/blocks";

/**
 * Repository for block data access
 * Provides CRUD operations for workflow blocks
 */
export class BlockRepository extends BaseRepository<typeof blocks, Block, InsertBlock> {
  constructor(dbInstance?: typeof db) {
    super(blocks, dbInstance);
  }

  /**
   * Find all blocks for a workflow, optionally filtered by phase
   * Returns blocks ordered by order field
   */
  async findByWorkflowId(
    workflowId: string,
    phase?: BlockPhase,
    tx?: DbTransaction
  ): Promise<Block[]> {
    const database = this.getDb(tx);
    const conditions = phase
      ? and(eq(blocks.workflowId, workflowId), eq(blocks.phase, phase), eq(blocks.enabled, true))
      : and(eq(blocks.workflowId, workflowId), eq(blocks.enabled, true));

    return await database
      .select()
      .from(blocks)
      .where(conditions)
      .orderBy(asc(blocks.order));
  }

  /**
   * Find blocks by workflow and phase
   * Returns enabled blocks ordered by order field
   */
  async findByWorkflowPhase(
    workflowId: string,
    phase: BlockPhase,
    tx?: DbTransaction
  ): Promise<Block[]> {
    return this.findByWorkflowId(workflowId, phase, tx);
  }

  /**
   * Find blocks by section ID and phase
   * Returns enabled blocks ordered by order field
   */
  async findBySectionPhase(
    sectionId: string,
    phase: BlockPhase,
    tx?: DbTransaction
  ): Promise<Block[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(blocks)
      .where(
        and(
          eq(blocks.sectionId, sectionId),
          eq(blocks.phase, phase),
          eq(blocks.enabled, true)
        )
      )
      .orderBy(asc(blocks.order));
  }

  /**
   * Bulk update block order
   * Updates order field for multiple blocks in a transaction
   */
  async bulkUpdateOrder(
    updates: Array<{ id: string; order: number }>,
    tx?: DbTransaction
  ): Promise<void> {
    const database = this.getDb(tx);

    // Execute all updates in a transaction
    const executeUpdates = async (txn: DbTransaction) => {
      for (const { id, order } of updates) {
        await txn
          .update(blocks)
          .set({ order })
          .where(eq(blocks.id, id));
      }
    };

    if (tx) {
      await executeUpdates(tx);
    } else {
      await this.transaction(executeUpdates);
    }
  }

  /**
   * Find all blocks for a workflow (including disabled)
   * Returns blocks ordered by order field
   */
  async findAllByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<Block[]> {
    const database = this.getDb(tx);
    return await database
      .select()
      .from(blocks)
      .where(eq(blocks.workflowId, workflowId))
      .orderBy(asc(blocks.order));
  }

  /**
   * Delete all blocks for a workflow
   */
  async deleteByWorkflowId(workflowId: string, tx?: DbTransaction): Promise<void> {
    await this.deleteWhere(eq(blocks.workflowId, workflowId), tx);
  }

  /**
   * Delete all blocks for a section
   */
  async deleteBySectionId(sectionId: string, tx?: DbTransaction): Promise<void> {
    await this.deleteWhere(eq(blocks.sectionId, sectionId), tx);
  }
}

// Singleton instance
export const blockRepository = new BlockRepository();
