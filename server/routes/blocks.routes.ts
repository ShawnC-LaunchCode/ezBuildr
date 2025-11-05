import type { Express } from "express";
import { isAuthenticated } from "../googleAuth";
import { blockService } from "../services/BlockService";
import { z } from "zod";

/**
 * Register block management routes
 * Handles CRUD operations for workflow blocks
 */
export function registerBlockRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/blocks
   * Create a new block
   */
  app.post('/api/workflows/:workflowId/blocks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
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
      console.error("Error creating block:", error);
      const message = error instanceof Error ? error.message : "Failed to create block";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });

  /**
   * GET /api/workflows/:workflowId/blocks
   * List all blocks for a workflow
   */
  app.get('/api/workflows/:workflowId/blocks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }

      const { workflowId } = req.params;
      const phase = req.query.phase as string | undefined;

      const blocks = await blockService.listBlocks(workflowId, userId, phase as any);
      res.json({ success: true, data: blocks });
    } catch (error) {
      console.error("Error listing blocks:", error);
      const message = error instanceof Error ? error.message : "Failed to list blocks";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });

  /**
   * GET /api/blocks/:blockId
   * Get a single block by ID
   */
  app.get('/api/blocks/:blockId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }

      const { blockId } = req.params;
      const block = await blockService.getBlock(blockId, userId);
      res.json({ success: true, data: block });
    } catch (error) {
      console.error("Error fetching block:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch block";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });

  /**
   * PUT /api/blocks/:blockId
   * Update a block
   */
  app.put('/api/blocks/:blockId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }

      const { blockId } = req.params;
      const updates = req.body;

      const block = await blockService.updateBlock(blockId, userId, updates);
      res.json({ success: true, data: block });
    } catch (error) {
      console.error("Error updating block:", error);
      const message = error instanceof Error ? error.message : "Failed to update block";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });

  /**
   * DELETE /api/blocks/:blockId
   * Delete a block
   */
  app.delete('/api/blocks/:blockId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }

      const { blockId } = req.params;
      await blockService.deleteBlock(blockId, userId);
      res.json({ success: true, data: { message: "Block deleted successfully" } });
    } catch (error) {
      console.error("Error deleting block:", error);
      const message = error instanceof Error ? error.message : "Failed to delete block";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/blocks/reorder
   * Bulk reorder blocks
   */
  app.put('/api/workflows/:workflowId/blocks/reorder', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
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
      console.error("Error reordering blocks:", error);
      const message = error instanceof Error ? error.message : "Failed to reorder blocks";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });
}
