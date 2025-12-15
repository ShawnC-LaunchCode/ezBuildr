import {
  blockRepository,
  workflowRepository,
  stepRepository,
  sectionRepository,
} from "../repositories";
import type { Block } from "@shared/schema";
import type { ListToolsConfig } from "@shared/types/blocks";
import { workflowService } from "./WorkflowService";
import { logger } from "../logger";

/**
 * Service layer for list tools block business logic
 * Manages creation/updates of list tools blocks and their associated virtual steps
 */
export class ListToolsBlockService {
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
   * Create a new list tools block
   * Also creates a virtual step to store the block's output
   */
  async createBlock(
    workflowId: string,
    userId: string,
    data: {
      name: string;
      sectionId?: string | null;
      config: ListToolsConfig;
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
        throw new Error("Cannot create list tools block: workflow has no sections.");
      }
      targetSectionId = sections[0].id;
    }

    // Create virtual step for persistence
    const virtualStep = await this.stepRepo.create({
      sectionId: targetSectionId,
      type: 'computed',
      title: `List Tools: ${data.name}`,
      description: `Virtual step for list tools block: ${data.name}`,
      alias: data.config.outputKey,
      required: false,
      order: -1,
      isVirtual: true,
    });

    // Create the block
    const block = await this.blockRepo.create({
      workflowId,
      type: 'list_tools',
      phase: data.phase,
      sectionId: data.sectionId || null,
      config: data.config,
      order: 0,
      virtualStepId: virtualStep.id,
      enabled: true,
    });

    logger.info({
      blockId: block.id,
      virtualStepId: virtualStep.id,
      outputVar: data.config.outputKey,
      operation: data.config.operation
    }, "Created list tools block with virtual step");

    return block;
  }

  /**
   * Update a list tools block
   * Updates virtual step alias if outputKey changes
   */
  async updateBlock(
    blockId: string,
    userId: string,
    data: {
      name?: string;
      config?: Partial<ListToolsConfig>;
      enabled?: boolean;
    }
  ): Promise<Block> {
    const block = await this.blockRepo.findById(blockId);
    if (!block) throw new Error("Block not found");

    await this.workflowSvc.verifyAccess(block.workflowId, userId);

    if ((block.type as string) !== 'list_tools') {
      throw new Error("Block is not a list tools block");
    }

    const currentConfig = block.config as ListToolsConfig;
    const newConfig = { ...currentConfig, ...data.config };

    // Update virtual step if output key changes
    if (
      data.config?.outputKey &&
      data.config.outputKey !== currentConfig.outputKey &&
      block.virtualStepId
    ) {
      await this.stepRepo.update(block.virtualStepId, {
        alias: data.config.outputKey,
        title: `List Tools: ${data.name || 'Updated List Tools'}`
      });
    } else if (data.name && block.virtualStepId) {
      // Update title if only name changed
      await this.stepRepo.update(block.virtualStepId, {
        title: `List Tools: ${data.name}`
      });
    }

    return await this.blockRepo.update(blockId, {
      config: newConfig,
      enabled: data.enabled
    });
  }
}

export const listToolsBlockService = new ListToolsBlockService();
