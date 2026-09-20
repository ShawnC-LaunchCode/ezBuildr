import type { Block, InsertBlock } from "@shared/schema";
import type { BlockPhase } from "@shared/types/blocks";

import {
  blockRepository,
  workflowRepository,
  pageRepository,
  type DbTransaction,
} from "../repositories";
import { createLogger } from "../logger";
import {
  getCurrentTenantId,
  withCurrentTenant,
  withTenant,
  withVerifiedIdentifier,
} from "../utils/rlsContext";
import { workflowTenantResolver } from "./WorkflowTenantResolver";
import { workflowService } from "./WorkflowService";

const logger = createLogger({ module: 'block-service' });

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
   * Run one read of `blocks` under the right tenant, for the execution path.
   *
   * BLK-1: `blocks` now carries a tenant_isolation policy (migration 0050), so
   * an unscoped read returns ZERO rows rather than erroring — and
   * `BlockRunner.runPhase` treats an empty list as "nothing to run" and reports
   * success. Unscoped, every block in the product would stop executing with no
   * error anywhere. The previous comment here ("deliberately NOT tenant-wrapped
   * ... `blocks` carries no RLS policy", CLN-7) was true when written and is
   * now exactly backwards.
   *
   * A plain `withCurrentTenant` is still wrong, for the reason that comment
   * gave: this is reached from run paths with no ambient tenant (background
   * completion jobs, anonymous public-link runs) where it throws. So this
   * follows the pattern `RunLifecycleService.generateDocuments` established for
   * the same situation:
   *
   *   1. an ambient tenant (ordinary authenticated and run-token requests) is
   *      used as-is;
   *   2. otherwise the tenant is resolved FROM THE WORKFLOW via migration
   *      0030's self-identification clause — `workflowId` here is an
   *      established value, not request input, the same standing `runTokenAuth`
   *      relies on;
   *   3. if resolution fails, the read runs unscoped. That is not a hole: the
   *      policy's `is_public AND status = 'active'` disjunct is what makes
   *      anonymous public-link runs work, and a PRIVATE workflow correctly
   *      yields nothing. It is logged, because reaching here for a private
   *      workflow means blocks silently did not run.
   */
  private async readBlocksForExecution(
    workflowId: string,
    read: (tx?: DbTransaction) => Promise<Block[]>
  ): Promise<Block[]> {
    if (getCurrentTenantId() !== undefined) {
      return withCurrentTenant((tx) => read(tx));
    }

    const resolvedTenantId = await withVerifiedIdentifier(
      'app.current_workflow_id',
      workflowId,
      (tx) => workflowTenantResolver.resolveForWorkflowId(workflowId, tx)
    );
    if (resolvedTenantId) {
      return withTenant(resolvedTenantId, (tx) => read(tx));
    }

    logger.warn(
      { workflowId },
      'BLK-1: no tenant resolved for block execution; reading unscoped, so only a public active workflow will return blocks'
    );
    return read();
  }

  /**
   * Get blocks for a specific workflow phase (no ownership check - internal use)
   * Used by BlockRunner during workflow execution.
   *
   * Tenant scoping is `readBlocksForExecution`'s job — see the reasoning there
   * before changing it. Both branches below share ONE transaction, so the two
   * reads cannot straddle different tenant contexts.
   */
  async getBlocksForPhase(
    workflowId: string,
    phase: BlockPhase,
    pageId?: string
  ): Promise<Block[]> {
    return this.readBlocksForExecution(workflowId, async (tx) => {
      if (pageId) {
        // Get page-specific blocks and workflow-scoped blocks for this phase
        const [pageBlocks, workflowBlocks] = await Promise.all([
          this.blockRepo.findByPagePhase(pageId, phase, tx),
          this.blockRepo.findByWorkflowPhase(workflowId, phase, tx).then((blocks: Block[]) =>
            blocks.filter((b: Block) => !b.pageId) // Only workflow-scoped blocks
          ),
        ]);
        // Combine and sort by order
        return [...workflowBlocks, ...pageBlocks].sort((a: Block, b: Block) => a.order - b.order);
      }

      // Just get workflow-scoped blocks for this phase
      return this.blockRepo.findByWorkflowPhase(workflowId, phase, tx);
    });
  }
}

// Singleton instance
export const blockService = new BlockService();
