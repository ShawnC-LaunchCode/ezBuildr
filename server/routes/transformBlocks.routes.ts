/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { z } from "zod";

import { insertTransformBlockSchema } from "@shared/schema";

import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { autoRevertToDraft } from "../middleware/autoRevertToDraft";
import { testLimiter } from "../middleware/rateLimiting";
import { transformBlockRepository } from "../repositories/TransformBlockRepository";
import { transformBlockService } from "../services/TransformBlockService";
import { asyncHandler } from "../utils/asyncHandler";
import { classifyRouteError } from '../utils/routeErrors';

import type { Express, Request, Response } from "express";

const logger = createLogger({ module: "transform-blocks-routes" });

/**
 * Register transform block routes
 * Handles CRUD operations and test execution for transform blocks
 */
export function registerTransformBlockRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/transform-blocks
   * Create a new transform block
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.post('/api/workflows/:workflowId/transform-blocks', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        // eslint-disable-next-line sonarjs/no-duplicate-string
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;

      // Merge workflowId from URL params into body data for schema validation
      const dataWithWorkflowId = { ...req.body, workflowId };

      // Validate request body
      const blockData = insertTransformBlockSchema.parse(dataWithWorkflowId);

      const block = await transformBlockService.createBlock(workflowId, userId, blockData);
      res.status(201).json({ success: true, data: block });
    } catch (error) {
      logger.error({ error }, "Error creating transform block");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: "Invalid request data", details: error.errors });
      }
      const raw = error instanceof Error ? error.message : "";
      if (raw.includes("limit")) {
        return res.status(400).json({ success: false, error: raw });
      }
      const { status, message } = classifyRouteError(error, "Failed to create transform block");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/transform-blocks
   * List all transform blocks for a workflow
   */
  app.get('/api/workflows/:workflowId/transform-blocks', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const blocks = await transformBlockService.listBlocks(workflowId, userId);
      res.json({ success: true, data: blocks });
    } catch (error) {
      logger.error({ error }, "Error listing transform blocks");
      const { status, message } = classifyRouteError(error, "Failed to list transform blocks");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * GET /api/transform-blocks/:blockId
   * Get a single transform block
   */
  app.get('/api/transform-blocks/:blockId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { blockId } = req.params;
      const block = await transformBlockService.getBlock(blockId, userId);
      res.json({ success: true, data: block });
    } catch (error) {
      logger.error({ error }, "Error fetching transform block");
      const { status, message } = classifyRouteError(error, "Failed to fetch transform block");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * PUT /api/transform-blocks/:blockId
   * Update a transform block
   */
  app.put('/api/transform-blocks/:blockId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { blockId } = req.params;
      const updateData = req.body;

      // Look up workflowId for auto-revert middleware
      const block = await transformBlockRepository.findById(blockId);
      if (!block) {
        return res.status(404).json({ success: false, error: "Transform block not found" });
      }
      req.params.workflowId = block.workflowId;

      // Apply auto-revert
      await autoRevertToDraft(req, res, () => { });

      const updatedBlock = await transformBlockService.updateBlock(blockId, userId, updateData);
      res.json({ success: true, data: updatedBlock });
    } catch (error) {
      logger.error({ error }, "Error updating transform block");
      const { status, message } = classifyRouteError(error, "Failed to update transform block");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * DELETE /api/transform-blocks/:blockId
   * Delete a transform block
   */
  app.delete('/api/transform-blocks/:blockId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { blockId } = req.params;

      // Look up workflowId for auto-revert middleware
      const block = await transformBlockRepository.findById(blockId);
      if (!block) {
        return res.status(404).json({ success: false, error: "Transform block not found" });
      }
      req.params.workflowId = block.workflowId;

      // Apply auto-revert
      await autoRevertToDraft(req, res, () => { });

      await transformBlockService.deleteBlock(blockId, userId);
      res.status(200).json({ success: true, message: "Transform block deleted" });
    } catch (error) {
      logger.error({ error }, "Error deleting transform block");
      const { status, message } = classifyRouteError(error, "Failed to delete transform block");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * POST /api/transform-blocks/:blockId/test
   * Test a transform block with sample data
   */
  app.post('/api/transform-blocks/:blockId/test', hybridAuth, testLimiter, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { blockId } = req.params;
      const { data } = req.body;

      if (!data || typeof data !== 'object') {
        return res.status(400).json({ success: false, error: "data must be an object" });
      }

      // Validate data size
      const dataJson = JSON.stringify(data);
      if (dataJson.length > 64 * 1024) {
        return res.status(400).json({ success: false, error: "data size exceeds 64KB limit" });
      }

      const result = await transformBlockService.testBlock(blockId, userId, data);

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      logger.error({ error }, "Error testing transform block");
      const { status, message } = classifyRouteError(error, "Failed to test transform block");
      res.status(status).json({ success: false, error: message });
    }
  }));
}
