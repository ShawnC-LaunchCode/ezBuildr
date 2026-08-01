import type { InsertBlock } from "@shared/schema";
import type { BlockPhase } from "@shared/types/blocks";
import { z } from "zod";

import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { autoRevertToDraft } from "../middleware/autoRevertToDraft";
import { blockRepository } from "../repositories/BlockRepository";
import { stepRepository } from "../repositories/StepRepository";
import { blockService } from "../services/BlockService";
import { listToolsBlockService } from "../services/ListToolsBlockService";
import { queryBlockService } from "../services/QueryBlockService";
import { readTableBlockService } from "../services/ReadTableBlockService";
import { asyncHandler } from '../utils/asyncHandler';
import { classifyRouteError } from '../utils/routeErrors';

import type { Express, Request, Response } from "express";

interface BlockRequest {
  type: InsertBlock['type'];
  phase: BlockPhase;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- config structure varies by block type
  config: any;
  name?: string;
  sectionId?: string;
  enabled?: boolean;
}

const logger = createLogger({ module: 'blocks-routes' });

// eslint-disable-next-line sonarjs/no-duplicate-string
const UNAUTHORIZED_ERROR = "Unauthorized - no user ID";

/**
 * Register block management routes
 * Handles CRUD operations for workflow blocks
 */
// eslint-disable-next-line max-lines-per-function
export function registerBlockRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/blocks
   * Create a new block
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/api/workflows/:workflowId/blocks', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response): Promise<void> => {

    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ success: false, errors: [UNAUTHORIZED_ERROR] });
        return;
      }
      const { workflowId } = req.params;
      const blockData = req.body as BlockRequest;
      // Validate required fields

      if (!blockData.type || !blockData.phase || !blockData.config) {
        res.status(400).json({
          success: false,
          errors: ["Missing required fields: type, phase, config"],
        });
        return;
      }
      // Route to specialized service for query, read_table, and list_tools blocks (they need virtual steps)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let block: any;
      if (blockData.type === 'query') {
        block = await queryBlockService.createBlock(workflowId, userId, {
          name: blockData.name ?? 'Query Block',
          sectionId: blockData.sectionId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          config: blockData.config,
          phase: blockData.phase,
        });
      } else if (blockData.type === 'read_table') {
        block = await readTableBlockService.createBlock(workflowId, userId, {
          name: blockData.name ?? 'Read Table Block',
          sectionId: blockData.sectionId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          config: blockData.config,
          phase: blockData.phase,
        });
      } else if (blockData.type === 'list_tools') {
        block = await listToolsBlockService.createBlock(workflowId, userId, {
          name: blockData.name ?? 'List Tools Block',
          sectionId: blockData.sectionId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          config: blockData.config,
          phase: blockData.phase,
        });
      } else {
        // Generic block creation for other block types
        block = await blockService.createBlock(workflowId, userId, blockData);
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      res.status(201).json({ success: true, data: block });
    } catch (error: unknown) {
      logger.error({ error }, "Error creating block");
      const { status, message } = classifyRouteError(error, "Failed to create block");
      res.status(status).json({ success: false, errors: [message] });
    }
  }));
  /**
   * GET /api/workflows/:workflowId/blocks
   * List all blocks for a workflow
   */
  app.get('/api/workflows/:workflowId/blocks', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
        return;
      }
      const { workflowId } = req.params;
      const phase = req.query.phase as BlockPhase | undefined;
      const blocks = await blockService.listBlocks(workflowId, userId, phase);
      res.json({ success: true, data: blocks });
    } catch (error: unknown) {
      logger.error({ error }, "Error listing blocks");
      const { status, message } = classifyRouteError(error, "Failed to list blocks");
      res.status(status).json({ success: false, errors: [message] });
    }
  }));
  /**
   * GET /api/blocks/:blockId
   * Get a single block by ID
   */
  app.get('/api/blocks/:blockId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
        return;
      }
      const { blockId } = req.params;
      const block = await blockService.getBlock(blockId, userId);
      res.json({ success: true, data: block });
    } catch (error: unknown) {
      logger.error({ error }, "Error fetching block");
      const { status, message } = classifyRouteError(error, "Failed to fetch block");
      res.status(status).json({ success: false, errors: [message] });
    }
  }));
  /**
   * PUT /api/blocks/:blockId
   * Update a block
   */
  app.put('/api/blocks/:blockId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
        return;
      }
      const { blockId } = req.params;
      const updates = req.body as BlockRequest;
      // Look up workflowId for auto-revert middleware
      const block = await blockRepository.findById(blockId);
      if (!block) {
        res.status(404).json({ success: false, errors: ["Block not found"] });
        return;
      }
      req.params.workflowId = block.workflowId;
      // Apply auto-revert
      await autoRevertToDraft(req, res, () => { });
      // Route to specialized service for query, read_table, and list_tools blocks
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let updatedBlock: any;
      if ((block.type as string) === 'query') {
        updatedBlock = await queryBlockService.updateBlock(blockId, userId, {
          name: updates.name,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          config: updates.config,
          enabled: updates.enabled,
        });
      } else if ((block.type as string) === 'read_table') {
        updatedBlock = await readTableBlockService.updateBlock(blockId, userId, {
          name: updates.name,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          config: updates.config,
          enabled: updates.enabled,
        });
      } else if ((block.type as string) === 'list_tools') {
        updatedBlock = await listToolsBlockService.updateBlock(blockId, userId, {
          name: updates.name,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          config: updates.config,
          enabled: updates.enabled,
        });
      } else {
        updatedBlock = await blockService.updateBlock(blockId, userId, updates);
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      res.json({ success: true, data: updatedBlock });
    } catch (error: unknown) {
      logger.error({ error }, "Error updating block");
      const { status, message } = classifyRouteError(error, "Failed to update block");
      res.status(status).json({ success: false, errors: [message] });
    }
  }));
  /**
   * DELETE /api/blocks/:blockId
   * Delete a block
   */
  app.delete('/api/blocks/:blockId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
        return;
      }
      const { blockId } = req.params;
      // Look up workflowId for auto-revert middleware
      const block = await blockRepository.findById(blockId);
      if (!block) {
        res.status(404).json({ success: false, errors: ["Block not found"] });
        return;
      }
      req.params.workflowId = block.workflowId;
      // Apply auto-revert
      await autoRevertToDraft(req, res, () => { });
      await blockService.deleteBlock(blockId, userId);
      res.json({ success: true, data: { message: "Block deleted successfully" } });
    } catch (error: unknown) {
      logger.error({ error }, "Error deleting block");
      const { status, message } = classifyRouteError(error, "Failed to delete block");
      res.status(status).json({ success: false, errors: [message] });
    }
  }));
  /**
   * PUT /api/workflows/:workflowId/blocks/reorder
   * Bulk reorder blocks
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.put('/api/workflows/:workflowId/blocks/reorder', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
        return;
      }
      const { workflowId } = req.params;
      const { blocks } = req.body as { blocks: { id: string; order: number }[] };
      if (!Array.isArray(blocks)) {
        res.status(400).json({
          success: false,
          errors: ["blocks must be an array of {id, order}"],
        });
        return;
      }
      await blockService.reorderBlocks(workflowId, userId, blocks);
      res.json({ success: true, data: { message: "Blocks reordered successfully" } });
    } catch (error: unknown) {
      logger.error({ error }, "Error reordering blocks");
      const { status, message } = classifyRouteError(error, "Failed to reorder blocks");
      res.status(status).json({ success: false, errors: [message] });
    }
  }));
  /**
   * POST /api/workflows/:workflowId/steps/:stepId/create-list-tools
   * Create a List Tools block inline from a Choice question
   * Used for "Create List Tools" button in Choice question editor
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/api/workflows/:workflowId/steps/:stepId/create-list-tools', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
        return;
      }
      const { workflowId, stepId } = req.params;
      const transformConfigSchema = z.object({
        filters: z.array(z.unknown()).optional(),
        sort: z.object({
          field: z.string(),
          direction: z.enum(['asc', 'desc'])
        }).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
        offset: z.number().int().min(0).optional(),
        dedupe: z.boolean().optional(),
        select: z.array(z.string()).optional()
      }).optional().nullable();
      const createListToolsSchema = z.object({
        sourceListVar: z.string().min(1, "sourceListVar is required"),
        sectionId: z.string().min(1, "sectionId is required"),
        transformConfig: transformConfigSchema,
      });

      const parsedBody = createListToolsSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ success: false, errors: parsedBody.error.issues.map(e => e.message) });
      }

      const { sourceListVar, sectionId, transformConfig } = parsedBody.data;

      // Validation

      if (!sourceListVar) {
        res.status(400).json({
          success: false,
          errors: ["sourceListVar is required"],
        });
        return;
      }

      if (!sectionId) {
        res.status(400).json({
          success: false,
          errors: ["sectionId is required"],
        });
        return;
      }
      // Generate unique output variable name
      const allSteps = await stepRepository.findByWorkflowId(workflowId);
      const existingAliases = new Set(allSteps.map((s) => s.alias).filter(Boolean));
      let outputVar = `${sourceListVar}_filtered`;
      let counter = 2;
      while (existingAliases.has(outputVar)) {
        outputVar = `${sourceListVar}_filtered_${counter}`;
        counter++;
      }
      // Build List Tools config from transform config
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- config structure built dynamically
      const listToolsConfig: any = {

        sourceListVar,
        outputKey: outputVar,
        outputListVar: outputVar,
      };
      // Map transform config from Choice question format to List Tools format

      if (transformConfig) {

        if (transformConfig.filters) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          listToolsConfig.filters = transformConfig.filters;
        }

        if (transformConfig.sort) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          listToolsConfig.sort = transformConfig.sort;
        }

        if (transformConfig.limit !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          listToolsConfig.limit = transformConfig.limit;
        }

        if (transformConfig.offset !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          listToolsConfig.offset = transformConfig.offset;
        }

        if (transformConfig.dedupe) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          listToolsConfig.dedupe = transformConfig.dedupe;
        }

        if (transformConfig.select) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          listToolsConfig.select = transformConfig.select;
        }
      }
      // Create the List Tools block

      const block = await listToolsBlockService.createBlock(workflowId, userId, {
        name: `Options for ${stepId.substring(0, 8)}`,

        sectionId: sectionId,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: listToolsConfig,
        phase: 'onSectionEnter',
      });
      logger.info({
        blockId: block.id,
        stepId,

        sourceListVar,
        outputVar,

        sectionId
      }, "Created List Tools block inline from Choice question");
      res.status(201).json({
        success: true,
        data: {
          block,
          outputVar,
          message: "List Tools block created successfully"
        }
      });
    } catch (error: unknown) {
      logger.error({ error }, "Error creating inline List Tools block");
      const { status, message } = classifyRouteError(error, "Failed to create List Tools block");
      res.status(status).json({ success: false, errors: [message] });
    }
  }));
}
