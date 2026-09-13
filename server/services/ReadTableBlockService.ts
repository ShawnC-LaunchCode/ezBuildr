import type { Block } from "@shared/schema";
import type { ReadTableConfig } from "@shared/types/blocks";

import { logger } from "../logger";
import {
  blockRepository,
  workflowRepository,
  stepRepository,
  pageRepository,
} from "../repositories";
import { withCurrentTenant } from "../utils/rlsContext";

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
    // Verify ownership. Deliberately outside the transaction below: a
    // transaction opened inside another deadlocks the size-1 test pool.
    await this.workflowSvc.verifyAccess(workflowId, userId);

    // CLN-7: `pages` and `steps` are RLS-covered. On the bare pool a non-owner
    // role sees no pages, sees no steps (so the order below was miscomputed),
    // and fails the virtual-step insert, so every read and write shares one
    // tenant transaction. Sequential, not Promise.all: concurrent queries on
    // one transaction handle deadlock.
    const { block, virtualStepId } = await withCurrentTenant(async (tx) => {
      // Determine target page
      let targetPageId = data.pageId;

      if (!targetPageId) {
        // For workflow-scoped blocks, attach valid step to first page
        const pages = await this.pageRepo.findByWorkflowId(workflowId, tx);
        if (pages.length === 0) {
          throw new Error("Cannot create read table block: workflow has no pages.");
        }
        targetPageId = pages[0].id;
      }

      // Calculate order: put at the end of the page, after every step and
      // every block in it.
      const pageSteps = await this.stepRepo.findByPageId(targetPageId, tx);
      const pageBlocks = await this.blockRepo.findByPagePhase(targetPageId, data.phase, tx);

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
      }, tx);

      // Create the block
      const created = await this.blockRepo.create({
        workflowId,
        type: 'read_table',
        phase: data.phase,
        pageId: data.pageId ?? null,
        config: data.config,
        order: newOrder,
        virtualStepId: virtualStep.id,
        enabled: true,
      }, tx);

      return { block: created, virtualStepId: virtualStep.id };
    });

    logger.info({
      blockId: block.id,
      virtualStepId,
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
    const block = await withCurrentTenant((tx) => this.blockRepo.findById(blockId, tx));
    if (!block) {throw new Error("Block not found");}

    await this.workflowSvc.verifyAccess(block.workflowId, userId);

    if ((block.type as string) !== 'read_table') {
      throw new Error("Block is not a read table block");
    }

    const currentConfig = block.config as ReadTableConfig;
    // Merge configs - note: null values in data.config will override existing values
    const newConfig = { ...currentConfig, ...data.config };

    // CLN-7: an RLS-filtered UPDATE on the bare pool matches zero rows and
    // fails silently, so the virtual step's rename runs in the tenant
    // transaction along with the block update.
    return withCurrentTenant(async (tx) => {
      // Update virtual step if output key changes
      if (
        data.config?.outputKey &&
        data.config.outputKey !== currentConfig.outputKey &&
        block.virtualStepId
      ) {
        await this.stepRepo.update(block.virtualStepId, {
          alias: data.config.outputKey,
          title: `Read Table: ${data.name ?? 'Updated Read Table'}`
        }, tx);
      } else if (data.name && block.virtualStepId) {
        // Update title if only name changed
        await this.stepRepo.update(block.virtualStepId, {
          title: `Read Table: ${data.name}`
        }, tx);
      }

      return this.blockRepo.update(blockId, {
        config: newConfig,
        enabled: data.enabled
      }, tx);
    });
  }
}

export const readTableBlockService = new ReadTableBlockService();
