import type { Block } from "@shared/schema";
import type { ListToolsConfig } from "@shared/types/blocks";

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
 * Service layer for list tools block business logic
 * Manages creation/updates of list tools blocks and their associated virtual steps
 */
export class ListToolsBlockService {
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
   * Create a new list tools block
   * Also creates a virtual step to store the block's output
   */
  async createBlock(
    workflowId: string,
    userId: string,
    data: {
      name: string;
      pageId?: string | null;
      config: ListToolsConfig;
      phase: "onRunStart" | "onPageEnter" | "onPageSubmit" | "onNext" | "onRunComplete";
    }
  ): Promise<Block> {
    // Verify ownership. Deliberately outside the transaction below: a
    // transaction opened inside another deadlocks the size-1 test pool.
    await this.workflowSvc.verifyAccess(workflowId, userId);

    // CLN-7: `pages` and `steps` are RLS-covered. On the bare pool a non-owner
    // role sees no pages ("workflow has no pages") and the virtual-step insert
    // fails its policy, so every read and write shares one tenant transaction.
    // Sequential, not Promise.all: concurrent queries on one transaction
    // handle deadlock.
    const { block, virtualStepId } = await withCurrentTenant(async (tx) => {
      // Determine target page
      let targetPageId = data.pageId;

      if (!targetPageId) {
        // For workflow-scoped blocks, attach valid step to first page
        const pages = await this.pageRepo.findByWorkflowId(workflowId, tx);
        if (pages.length === 0) {
          throw new Error("Cannot create list tools block: workflow has no pages.");
        }
        targetPageId = pages[0].id;
      }

      // Create virtual step for persistence
      const virtualStep = await this.stepRepo.create({
        workflowId,
        pageId: targetPageId,
        type: 'computed',
        title: `List Tools: ${data.name}`,
        description: `Virtual step for list tools block: ${data.name}`,
        alias: data.config.outputListVar,
        required: false,
        order: -1,
        isVirtual: true,
      }, tx);

      // Create the block
      const created = await this.blockRepo.create({
        workflowId,
        type: 'list_tools',
        phase: data.phase,
        pageId: data.pageId ?? null,
        config: data.config,
        order: 0,
        virtualStepId: virtualStep.id,
        enabled: true,
      }, tx);

      return { block: created, virtualStepId: virtualStep.id };
    });

    logger.info({
      blockId: block.id,
      virtualStepId,
      outputVar: data.config.outputListVar,
      sourceVar: data.config.sourceListVar
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
    const block = await withCurrentTenant((tx) => this.blockRepo.findById(blockId, tx));
    if (!block) {throw new Error("Block not found");}

    await this.workflowSvc.verifyAccess(block.workflowId, userId);

    if ((block.type as string) !== 'list_tools') {
      throw new Error("Block is not a list tools block");
    }

    const currentConfig = block.config as ListToolsConfig;
    const newConfig = { ...currentConfig, ...data.config };

    // CLN-7: an RLS-filtered UPDATE on the bare pool matches zero rows and
    // fails silently, so the virtual step's rename runs in the tenant
    // transaction along with the block update.
    return withCurrentTenant(async (tx) => {
      // Update virtual step if output key changes
      if (
        data.config?.outputListVar &&
        data.config.outputListVar !== currentConfig.outputListVar &&
        block.virtualStepId
      ) {
        await this.stepRepo.update(block.virtualStepId, {
          alias: data.config.outputListVar,
          title: `List Tools: ${data.name ?? 'Updated List Tools'}`
        }, tx);
      } else if (data.name && block.virtualStepId) {
        // Update title if only name changed
        await this.stepRepo.update(block.virtualStepId, {
          title: `List Tools: ${data.name}`
        }, tx);
      }

      return this.blockRepo.update(blockId, {
        config: newConfig,
        enabled: data.enabled
      }, tx);
    });
  }
}

export const listToolsBlockService = new ListToolsBlockService();
