import type { Block, InsertBlock } from "@shared/schema";
import type { BlockPhase } from "@shared/types/blocks";

import {
  blockRepository,
  workflowRepository,
  pageRepository,
} from "../repositories";
import { workflowService } from "./WorkflowService";

/**
 * Service layer for block-related business logic
 * Handles CRUD operations for workflow blocks with ownership verification
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
    workflowId: string
  ): Promise<void> {
    const page = await this.pageRepo.findById(pageId);
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

    // If pageId is provided, verify it belongs to the workflow
    if (data.pageId) {
      await this.verifyPageBelongsToWorkflow(data.pageId, workflowId);
    }

    return this.blockRepo.create({
      ...data,
      workflowId,
    });
  }

  /**
   * Get block by ID
   */
  async getBlock(blockId: string, userId: string): Promise<Block> {
    const block = await this.blockRepo.findById(blockId);
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

    if (phase) {
      return this.blockRepo.findByWorkflowPhase(workflowId, phase);
    }

    return this.blockRepo.findAllByWorkflowId(workflowId);
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

    // If updating pageId, verify it belongs to the workflow
    if (updates.pageId) {
      await this.verifyPageBelongsToWorkflow(updates.pageId, block.workflowId);
    }

    return this.blockRepo.update(blockId, updates);
  }

  /**
   * Delete a block
   */
  async deleteBlock(blockId: string, userId: string): Promise<void> {
    await this.getBlock(blockId, userId); // Verify ownership
    await this.blockRepo.delete(blockId);
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

    // Verify all blocks belong to this workflow
    for (const { id } of updates) {
      const block = await this.blockRepo.findById(id);
      if (!block) {
        throw new Error(`Block ${id} not found`);
      }
      if (block.workflowId !== workflowId) {
        throw new Error(`Block ${id} does not belong to workflow ${workflowId}`);
      }
    }

    await this.blockRepo.bulkUpdateOrder(updates);
  }

  /**
   * Get blocks for a specific workflow phase (no ownership check - internal use)
   * Used by BlockRunner during workflow execution
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
