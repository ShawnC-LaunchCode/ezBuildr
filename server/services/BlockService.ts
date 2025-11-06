import {
  transformBlockRepository,
  workflowRepository,
  sectionRepository,
} from "../repositories";
import type { Block, InsertBlock } from "@shared/schema";
import type { BlockPhase } from "@shared/types/blocks";

/**
 * Service layer for block-related business logic
 * Handles CRUD operations for workflow blocks with ownership verification
 */
export class BlockService {
  private blockRepo: typeof transformBlockRepository;
  private workflowRepo: typeof workflowRepository;
  private sectionRepo: typeof sectionRepository;

  constructor(
    blockRepo?: typeof transformBlockRepository,
    workflowRepo?: typeof workflowRepository,
    sectionRepo?: typeof sectionRepository
  ) {
    this.blockRepo = blockRepo || transformBlockRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
    this.sectionRepo = sectionRepo || sectionRepository;
  }

  /**
   * Verify user owns the workflow
   */
  private async verifyWorkflowOwnership(workflowId: string, userId: string): Promise<void> {
    const workflow = await this.workflowRepo.findById(workflowId);
    if (!workflow) {
      throw new Error("Workflow not found");
    }
    if (workflow.creatorId !== userId) {
      throw new Error("Access denied: You do not own this workflow");
    }
  }

  /**
   * Verify section belongs to workflow
   */
  private async verifySectionBelongsToWorkflow(
    sectionId: string,
    workflowId: string
  ): Promise<void> {
    const section = await this.sectionRepo.findById(sectionId);
    if (!section) {
      throw new Error("Section not found");
    }
    if (section.workflowId !== workflowId) {
      throw new Error("Section does not belong to this workflow");
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

    // If sectionId is provided, verify it belongs to the workflow
    if (data.sectionId) {
      await this.verifySectionBelongsToWorkflow(data.sectionId, workflowId);
    }

    return await this.blockRepo.create({
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
      return await this.blockRepo.findByWorkflowPhase(workflowId, phase);
    }

    return await this.blockRepo.findAllByWorkflowId(workflowId);
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

    // If updating sectionId, verify it belongs to the workflow
    if (updates.sectionId) {
      await this.verifySectionBelongsToWorkflow(updates.sectionId, block.workflowId);
    }

    return await this.blockRepo.update(blockId, {
      ...updates,
      updatedAt: new Date(),
    });
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
    sectionId?: string
  ): Promise<Block[]> {
    if (sectionId) {
      // Get section-specific blocks and workflow-scoped blocks for this phase
      const [sectionBlocks, workflowBlocks] = await Promise.all([
        this.blockRepo.findBySectionPhase(sectionId, phase),
        this.blockRepo.findByWorkflowPhase(workflowId, phase).then(blocks =>
          blocks.filter(b => !b.sectionId) // Only workflow-scoped blocks
        ),
      ]);
      // Combine and sort by order
      return [...workflowBlocks, ...sectionBlocks].sort((a, b) => a.order - b.order);
    }

    // Just get workflow-scoped blocks for this phase
    return await this.blockRepo.findByWorkflowPhase(workflowId, phase);
  }
}

// Singleton instance
export const blockService = new BlockService();
