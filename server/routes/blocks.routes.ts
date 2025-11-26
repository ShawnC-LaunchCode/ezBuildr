import type { Express, Request, Response } from "express";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { blockService } from "../services/BlockService";
import { blockRepository } from "../repositories/BlockRepository";
import { z } from "zod";
import { createLogger } from "../logger";
import type { BlockPhase } from "@shared/types/blocks";
import { autoRevertToDraft } from "../middleware/autoRevertToDraft";

const logger = createLogger({ module: 'blocks-routes' });

/**
 * Register block management routes
 * Handles CRUD operations for workflow blocks
 */
export function registerBlockRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/blocks
   * Create a new block
   */
  app.post('/api/workflows/:workflowId/blocks', hybridAuth, autoRevertToDraft, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }

      const { workflowId } = req.params;
      const blockData = req.body;

      // Validate required fields
      if (!blockData.type || !blockData.phase || !blockData.config) {
        return res.status(400).json({
          success: false,
          errors: ["Missing required fields: type, phase, config"],
        });
      }

      const block = await blockService.createBlock(workflowId, userId, blockData);
      res.status(201).json({ success: true, data: block });
    } catch (error) {
      logger.error({ error }, "Error creating block");
      const message = error instanceof Error ? error.message : "Failed to create block";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });

  /**
   * GET /api/workflows/:workflowId/blocks
   * List all blocks for a workflow
   */
  app.get('/api/workflows/:workflowId/blocks', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }

      const { workflowId } = req.params;
      const phase = req.query.phase as BlockPhase | undefined;

      const blocks = await blockService.listBlocks(workflowId, userId, phase);
      res.json({ success: true, data: blocks });
    } catch (error) {
      logger.error({ error }, "Error listing blocks");
      const message = error instanceof Error ? error.message : "Failed to list blocks";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });

  /**
   * GET /api/blocks/:blockId
   * Get a single block by ID
   */
  app.get('/api/blocks/:blockId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }

      const { blockId } = req.params;
      const block = await blockService.getBlock(blockId, userId);
      res.json({ success: true, data: block });
    } catch (error) {
      logger.error({ error }, "Error fetching block");
      const message = error instanceof Error ? error.message : "Failed to fetch block";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });

  /**
   * PUT /api/blocks/:blockId
   * Update a block
   */
  app.put('/api/blocks/:blockId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }

      const { blockId } = req.params;
      const updates = req.body;

      // Look up workflowId for auto-revert middleware
      const block = await blockRepository.findById(blockId);
      if (!block) {
        return res.status(404).json({ success: false, errors: ["Block not found"] });
      }
      req.params.workflowId = block.workflowId;

      // Apply auto-revert
      await autoRevertToDraft(req, res, () => {});

      const updatedBlock = await blockService.updateBlock(blockId, userId, updates);
      res.json({ success: true, data: updatedBlock });
    } catch (error) {
      logger.error({ error }, "Error updating block");
      const message = error instanceof Error ? error.message : "Failed to update block";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });

  /**
   * DELETE /api/blocks/:blockId
   * Delete a block
   */
  app.delete('/api/blocks/:blockId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }

      const { blockId } = req.params;

      // Look up workflowId for auto-revert middleware
      const block = await blockRepository.findById(blockId);
      if (!block) {
        return res.status(404).json({ success: false, errors: ["Block not found"] });
      }
      req.params.workflowId = block.workflowId;

      // Apply auto-revert
      await autoRevertToDraft(req, res, () => {});

      await blockService.deleteBlock(blockId, userId);
      res.json({ success: true, data: { message: "Block deleted successfully" } });
    } catch (error) {
      logger.error({ error }, "Error deleting block");
      const message = error instanceof Error ? error.message : "Failed to delete block";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/blocks/reorder
   * Bulk reorder blocks
   */
  app.put('/api/workflows/:workflowId/blocks/reorder', hybridAuth, autoRevertToDraft, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }

      const { workflowId } = req.params;
      const { blocks } = req.body;

      if (!Array.isArray(blocks)) {
        return res.status(400).json({
          success: false,
          errors: ["blocks must be an array of {id, order}"],
        });
      }

      await blockService.reorderBlocks(workflowId, userId, blocks);
      res.json({ success: true, data: { message: "Blocks reordered successfully" } });
    } catch (error) {
      logger.error({ error }, "Error reordering blocks");
      const message = error instanceof Error ? error.message : "Failed to reorder blocks";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });
}
