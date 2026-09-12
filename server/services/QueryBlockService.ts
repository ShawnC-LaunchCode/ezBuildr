import type { Block } from "@shared/schema";
import type { QueryBlockConfig } from "@shared/types/blocks";

import { logger } from "../logger";
import { stepRepository , pageRepository ,
    blockRepository,
    workflowRepository,
} from "../repositories";


import { workflowService } from "./WorkflowService";

/**
 * Service layer for query block business logic
 * Manages creation/updates of query blocks and their associated virtual steps
 */
export class QueryBlockService {
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
     * Create a new query block
     * Also creates a virtual step to store the block's output list
     */
    async createBlock(
        workflowId: string,
        userId: string,
        data: {
            name: string;
            pageId?: string | null;
            config: QueryBlockConfig;
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
                throw new Error("Cannot create query block: workflow has no pages.");
            }
            targetPageId = pages[0].id;
        }

        // Create virtual step for persistence
        const virtualStep = await this.stepRepo.create({
            workflowId,
            pageId: targetPageId,
            type: 'computed',
            title: `Query: ${data.name}`,
            description: `Virtual step for query block: ${data.name}`,
            alias: data.config.outputVariableName,
            required: false,
            order: -1,
            isVirtual: true,
        });

        // Create the block
        const block = await this.blockRepo.create({
            workflowId,
            type: 'query',
            phase: data.phase,
            pageId: data.pageId ?? null,
            config: data.config,
            order: 0, // Should be calculated or app logic handles reordering
            virtualStepId: virtualStep.id,
            enabled: true,
        });

        logger.info({
            blockId: block.id,
            virtualStepId: virtualStep.id,
            outputVar: data.config.outputVariableName
        }, "Created query block with virtual step");

        return block;
    }

    /**
     * Update a query block
     * Updates virtual step alias if outputVariableName changes
     */
    async updateBlock(
        blockId: string,
        userId: string,
        data: {
            name?: string;
            config?: Partial<QueryBlockConfig>;
            enabled?: boolean;
        }
    ): Promise<Block> {
        const block = await this.blockRepo.findById(blockId);
        if (!block) {throw new Error("Block not found");}

        await this.workflowSvc.verifyAccess(block.workflowId, userId);

        if (block.type !== 'query') {
            throw new Error("Block is not a query block");
        }

        const currentConfig = block.config as QueryBlockConfig;
        const newConfig = { ...currentConfig, ...data.config };

        // Update virtual step if output variable name changes
        if (
            data.config?.outputVariableName &&
            data.config.outputVariableName !== currentConfig.outputVariableName &&
            block.virtualStepId
        ) {
            await this.stepRepo.update(block.virtualStepId, {
                alias: data.config.outputVariableName,
                title: `Query: ${data.name ?? 'Updated Query'}`
            });
        } else if (data.name && block.virtualStepId) {
            // Update title if only name changed
            await this.stepRepo.update(block.virtualStepId, {
                title: `Query: ${data.name}`
            });
        }

        return this.blockRepo.update(blockId, {
            config: newConfig,
            enabled: data.enabled
        });
    }

    /**
     * Execute a single query block logic (runtime execution)
     * Note: BlockRunner calls this, or calls QueryRunner directly. 
     * Since this service manages the Block entity, let's keep runtime execution separate in BlockRunner/QueryRunner for now,
     * OR we can expose a helper here. 
     * Given BlockRunner structure, it likely calls services. 
     * We will stick to the pattern: Service manages Entity, Runner manages Execution.
     */
}

export const queryBlockService = new QueryBlockService();
