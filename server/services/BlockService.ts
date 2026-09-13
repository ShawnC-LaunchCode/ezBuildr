import type { Block, InsertBlock } from "@shared/schema";
import type { BlockPhase } from "@shared/types/blocks";

import {
  blockRepository,
  workflowRepository,
  pageRepository,
  type DbTransaction,
} from "../repositories";
import { withCurrentTenant } from "../utils/rlsContext";
import { workflowService } from "./WorkflowService";

/**
 * Service layer for block-related business logic
 * Handles CRUD operations for workflow blocks with ownership verification
 *
 * CLN-7: every repository call here runs in a tenant transaction. `pages` is
 * RLS-covered, so on the bare pool a non-owner role cannot see the page it is
 * asked to attach a block to ("Page not found"). `blocks` itself carries no
 * policy, but its reads and writes share the same transaction so a block and
 * the page check that authorizes it are one consistent unit. Ownership checks
 * (`verifyAccess`) stay OUTSIDE those transactions: a transaction opened
 * inside another deadlocks the size-1 test pool.
 */
export class BlockService {
  private blockRepo: typeof blockRepository;
  private workflowRepo: typeof workflowRepository;
  private pageRepo: typeof pageRepository;
  private workflowSvc: typeof workflowService;

  constructor(
    blockRepo?: typeof blockRepository,
    workflowRepo?: typeof workflowRepository,
    pageRepo?: typeof pageRepository,
    workflowSvc?: typeof workflowService
  ) {
    this.blockRepo = blockRepo ?? blockRepository;
    this.workflowRepo = workflowRepo ?? workflowRepository;
    this.pageRepo = pageRepo ?? pageRepository;
    this.workflowSvc = workflowSvc ?? workflowService;
  }

  /**
   * Verify user owns the workflow
   */
  private async verifyWorkflowOwnership(workflowId: string, userId: string): Promise<void> {
    await this.workflowSvc.verifyAccess(workflowId, userId, 'edit');
  }

  /**
   * Verify page belongs to workflow
   */
  private async verifyPageBelongsToWorkflow(
    pageId: string,
    workflowId: string,
    tx: DbTransaction
  ): Promise<void> {
    const page = await this.pageRepo.findById(pageId, tx);
    if (!page) {
      throw new Error("Page not found");
    }
    if (page.workflowId !== workflowId) {
      throw new Error("Page does not belong to this workflow");
    }
  }

  /**
   * Create a new block
   */
  async createBlock(
    workflowId: string,
    userId: string,
    data: Omit<InsertBlock, 'workflowId'>
  ): Promise<Block> {
    await this.verifyWorkflowOwnership(workflowId, userId);

    return withCurrentTenant(async (tx) => {
      // If pageId is provided, verify it belongs to the workflow
      if (data.pageId) {
        await this.verifyPageBelongsToWorkflow(data.pageId, workflowId, tx);
      }

      return this.blockRepo.create({
        ...data,
        workflowId,
      }, tx);
    });
  }

  /**
   * Get block by ID
   */
  async getBlock(blockId: string, userId: string): Promise<Block> {
    const block = await withCurrentTenant((tx) => this.blockRepo.findById(blockId, tx));
    if (!block) {
      throw new Error("Block not found");
    }

    // Verify ownership of the workflow
    await this.verifyWorkflowOwnership(block.workflowId, userId);

    return block;
  }

  /**
   * List all blocks for a workflow
   */
  async listBlocks(
    workflowId: string,
    userId: string,
    phase?: BlockPhase
  ): Promise<Block[]> {
    await this.verifyWorkflowOwnership(workflowId, userId);

    return withCurrentTenant((tx) => phase
      ? this.blockRepo.findByWorkflowPhase(workflowId, phase, tx)
      : this.blockRepo.findAllByWorkflowId(workflowId, tx));
  }

  /**
   * Update a block
   */
  async updateBlock(
    blockId: string,
    userId: string,
    updates: Partial<InsertBlock>
  ): Promise<Block> {
    const block = await this.getBlock(blockId, userId);

    return withCurrentTenant(async (tx) => {
      // If updating pageId, verify it belongs to the workflow
      if (updates.pageId) {
        await this.verifyPageBelongsToWorkflow(updates.pageId, block.workflowId, tx);
      }

      return this.blockRepo.update(blockId, updates, tx);
    });
  }

  /**
   * Delete a block
   */
  async deleteBlock(blockId: string, userId: string): Promise<void> {
    await this.getBlock(blockId, userId); // Verify ownership
    await withCurrentTenant((tx) => this.blockRepo.delete(blockId, tx));
  }

  /**
   * Reorder blocks
   * Updates the order field for multiple blocks
   */
  async reorderBlocks(
    workflowId: string,
    userId: string,
    updates: Array<{ id: string; order: number }>
  ): Promise<void> {
    await this.verifyWorkflowOwnership(workflowId, userId);

    await withCurrentTenant(async (tx) => {
      // Verify all blocks belong to this workflow
      for (const { id } of updates) {
        const block = await this.blockRepo.findById(id, tx);
        if (!block) {
          throw new Error(`Block ${id} not found`);
        }
        if (block.workflowId !== workflowId) {
          throw new Error(`Block ${id} does not belong to workflow ${workflowId}`);
        }
      }

      await this.blockRepo.bulkUpdateOrder(updates, tx);
    });
  }

  /**
   * Get blocks for a specific workflow phase (no ownership check - internal use)
   * Used by BlockRunner during workflow execution
   *
   * Deliberately NOT tenant-wrapped (CLN-7): it reads only `blocks`, which
   * carries no RLS policy, and BlockRunner reaches it from run paths that may
   * legitimately have no request tenant, where `withCurrentTenant` would throw
   * "RLS: no tenant in context" under enforcement.
   */
  async getBlocksForPhase(
    workflowId: string,
    phase: BlockPhase,
    pageId?: string
  ): Promise<Block[]> {
    if (pageId) {
      // Get page-specific blocks and workflow-scoped blocks for this phase
      const [pageBlocks, workflowBlocks] = await Promise.all([
        this.blockRepo.findByPagePhase(pageId, phase),
        this.blockRepo.findByWorkflowPhase(workflowId, phase).then((blocks: Block[]) =>
          blocks.filter((b: Block) => !b.pageId) // Only workflow-scoped blocks
        ),
      ]);
      // Combine and sort by order
      return [...workflowBlocks, ...pageBlocks].sort((a: Block, b: Block) => a.order - b.order);
    }

    // Just get workflow-scoped blocks for this phase
    return this.blockRepo.findByWorkflowPhase(workflowId, phase);
  }
}

// Singleton instance
export const blockService = new BlockService();
