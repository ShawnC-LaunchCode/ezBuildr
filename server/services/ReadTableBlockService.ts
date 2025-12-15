import {
  blockRepository,
  workflowRepository,
  stepRepository,
  sectionRepository,
} from "../repositories";
import type { Block } from "@shared/schema";
import type { ReadTableConfig } from "@shared/types/blocks";
import { workflowService } from "./WorkflowService";
import { logger } from "../logger";

/**
 * Service layer for read table block business logic
 * Manages creation/updates of read table blocks and their associated virtual steps
 */
export class ReadTableBlockService {
  private blockRepo: typeof blockRepository;
  private workflowRepo: typeof workflowRepository;
  private workflowSvc: typeof workflowService;
  private stepRepo: typeof stepRepository;
  private sectionRepo: typeof sectionRepository;

  constructor(
    blockRepo?: typeof blockRepository,
    workflowRepo?: typeof workflowRepository,
    workflowSvc?: typeof workflowService,
    stepRepo?: typeof stepRepository,
    sectionRepo?: typeof sectionRepository
  ) {
    this.blockRepo = blockRepo || blockRepository;
    this.workflowRepo = workflowRepo || workflowRepository;
    this.workflowSvc = workflowSvc || workflowService;
    this.stepRepo = stepRepo || stepRepository;
    this.sectionRepo = sectionRepo || sectionRepository;
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
      sectionId?: string | null;
      config: ReadTableConfig;
      phase: "onRunStart" | "onSectionEnter" | "onSectionSubmit" | "onNext" | "onRunComplete";
    }
  ): Promise<Block> {
    // Verify ownership
    await this.workflowSvc.verifyAccess(workflowId, userId);

    // Determine target section
    let targetSectionId = data.sectionId;

    if (!targetSectionId) {
      // For workflow-scoped blocks, attach valid step to first section
      const sections = await this.sectionRepo.findByWorkflowId(workflowId);
      if (sections.length === 0) {
        throw new Error("Cannot create read table block: workflow has no sections.");
      }
      targetSectionId = sections[0].id;
    }

    // Create virtual step for persistence
    const virtualStep = await this.stepRepo.create({
      sectionId: targetSectionId,
      type: 'computed',
      title: `Read Table: ${data.name}`,
      description: `Virtual step for read table block: ${data.name}`,
      alias: data.config.outputKey,
      required: false,
      order: -1,
      isVirtual: true,
    });

    // Create the block
    const block = await this.blockRepo.create({
      workflowId,
      type: 'read_table',
      phase: data.phase,
      sectionId: data.sectionId || null,
      config: data.config,
      order: 0, // Should be calculated or app logic handles reordering
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
    if (!block) throw new Error("Block not found");

    await this.workflowSvc.verifyAccess(block.workflowId, userId);

    if ((block.type as string) !== 'read_table') {
      throw new Error("Block is not a read table block");
    }

    const currentConfig = block.config as ReadTableConfig;
    const newConfig = { ...currentConfig, ...data.config };

    // Update virtual step if output key changes
    if (
      data.config?.outputKey &&
      data.config.outputKey !== currentConfig.outputKey &&
      block.virtualStepId
    ) {
      await this.stepRepo.update(block.virtualStepId, {
        alias: data.config.outputKey,
        title: `Read Table: ${data.name || 'Updated Read Table'}`
      });
    } else if (data.name && block.virtualStepId) {
      // Update title if only name changed
      await this.stepRepo.update(block.virtualStepId, {
        title: `Read Table: ${data.name}`
      });
    }

    return await this.blockRepo.update(blockId, {
      config: newConfig,
      enabled: data.enabled
    });
  }
}

export const readTableBlockService = new ReadTableBlockService();
