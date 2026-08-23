import type { Block } from "@shared/schema";
import type { ReadTableConfig } from "@shared/types/blocks";

import { logger } from "../logger";
import {
  blockRepository,
  workflowRepository,
  stepRepository,
  pageRepository,
} from "../repositories";

import { workflowService } from "./WorkflowService";

/**
 * Service layer for read table block business logic
 * Manages creation/updates of read table blocks and their associated virtual steps
 */
export class ReadTableBlockService {
  private blockRepo: typeof blockRepository;
  private workflowRepo: typeof workflowRepository;
  private workflowSvc: typeof workflowService;
  private stepRepo: typeof stepRepository;
  private pageRepo: typeof pageRepository;

  constructor(
    blockRepo?: typeof blockRepository,
    workflowRepo?: typeof workflowRepository,
    workflowSvc?: typeof workflowService,
    stepRepo?: typeof stepRepository,
    pageRepo?: typeof pageRepository
  ) {
    this.blockRepo = blockRepo ?? blockRepository;
    this.workflowRepo = workflowRepo ?? workflowRepository;
    this.workflowSvc = workflowSvc ?? workflowService;
    this.stepRepo = stepRepo ?? stepRepository;
    this.pageRepo = pageRepo ?? pageRepository;
  }

  /**
   * Create a new read table block
   * Also creates a virtual step to store the block's output list
   */
  async createBlock(
    workflowId: string,
    userId: string,
    data: {
      name: string;
      pageId?: string | null;
      config: ReadTableConfig;
      phase: "onRunStart" | "onPageEnter" | "onPageSubmit" | "onNext" | "onRunComplete";
    }
  ): Promise<Block> {
    // Verify ownership
    await this.workflowSvc.verifyAccess(workflowId, userId);

    // Determine target page
    let targetPageId = data.pageId;

    if (!targetPageId) {
      // For workflow-scoped blocks, attach valid step to first page
      const pages = await this.pageRepo.findByWorkflowId(workflowId);
      if (pages.length === 0) {
        throw new Error("Cannot create read table block: workflow has no pages.");
      }
      targetPageId = pages[0].id;
    }

    // Calculate order: put at the end of the page
    // Get max order from both steps and blocks in the page
    const [pageSteps, pageBlocks] = await Promise.all([
      this.stepRepo.findByPageId(targetPageId),
      // We want all blocks in this page to determine the next order index
      // Using 'onPageSubmit' as a proxy effectively, but ideally we check all phases that render in the main list
      // For now, finding all blocks in the page is safer if we want to be at the very bottom
      this.blockRepo.findByPagePhase(targetPageId, data.phase)
    ]);

    let maxOrder = -1;
    for (const step of pageSteps) {
      if (step.order > maxOrder) {maxOrder = step.order;}
    }
    for (const b of pageBlocks) {
      if (b.order > maxOrder) {maxOrder = b.order;}
    }

    const newOrder = maxOrder + 1;

    // Create virtual step for persistence
    const virtualStep = await this.stepRepo.create({
      workflowId,
      pageId: targetPageId,
      type: 'computed',
      title: `Read Table: ${data.name}`,
      description: `Virtual step for read table block: ${data.name}`,
      alias: data.config.outputKey,
      required: false,
      order: newOrder,
      isVirtual: true,
    });

    // Create the block
    const block = await this.blockRepo.create({
      workflowId,
      type: 'read_table',
      phase: data.phase,
      pageId: data.pageId ?? null,
      config: data.config,
      order: newOrder,
      virtualStepId: virtualStep.id,
      enabled: true,
    });

    logger.info({
      blockId: block.id,
      virtualStepId: virtualStep.id,
      outputVar: data.config.outputKey
    }, "Created read table block with virtual step");

    return block;
  }

  /**
   * Update a read table block
   * Updates virtual step alias if outputKey changes
   */
  async updateBlock(
    blockId: string,
    userId: string,
    data: {
      name?: string;
      config?: Partial<ReadTableConfig>;
      enabled?: boolean;
    }
  ): Promise<Block> {
    const block = await this.blockRepo.findById(blockId);
    if (!block) {throw new Error("Block not found");}

    await this.workflowSvc.verifyAccess(block.workflowId, userId);

    if ((block.type as string) !== 'read_table') {
      throw new Error("Block is not a read table block");
    }

    const currentConfig = block.config as ReadTableConfig;
    // Merge configs - note: null values in data.config will override existing values
    const newConfig = { ...currentConfig, ...data.config };

    // Update virtual step if output key changes
    if (
      data.config?.outputKey &&
      data.config.outputKey !== currentConfig.outputKey &&
      block.virtualStepId
    ) {
      await this.stepRepo.update(block.virtualStepId, {
        alias: data.config.outputKey,
        title: `Read Table: ${data.name ?? 'Updated Read Table'}`
      });
    } else if (data.name && block.virtualStepId) {
      // Update title if only name changed
      await this.stepRepo.update(block.virtualStepId, {
        title: `Read Table: ${data.name}`
      });
    }

    return this.blockRepo.update(blockId, {
      config: newConfig,
      enabled: data.enabled
    });
  }
}

export const readTableBlockService = new ReadTableBlockService();
