import type { Express } from "express";
import { isAuthenticated } from "../googleAuth";
import { insertTransformBlockSchema } from "@shared/schema";
import { transformBlockService } from "../services/TransformBlockService";
import { z } from "zod";

// Rate limiting for test endpoint (in-memory, per user)
const testRateLimits = new Map<string, { count: number; resetAt: number }>();
const TEST_RATE_LIMIT = 10; // requests per minute
const TEST_RATE_WINDOW = 60 * 1000; // 1 minute

function checkTestRateLimit(userId: string): { allowed: boolean; error?: string } {
  const now = Date.now();
  const userLimit = testRateLimits.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    // Reset or initialize
    testRateLimits.set(userId, {
      count: 1,
      resetAt: now + TEST_RATE_WINDOW,
    });
    return { allowed: true };
  }

  if (userLimit.count >= TEST_RATE_LIMIT) {
    return {
      allowed: false,
      error: `Rate limit exceeded. Maximum ${TEST_RATE_LIMIT} test requests per minute.`,
    };
  }

  userLimit.count++;
  return { allowed: true };
}

/**
 * Register transform block routes
 * Handles CRUD operations and test execution for transform blocks
 */
export function registerTransformBlockRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/transform-blocks
   * Create a new transform block
   */
  app.post('/api/workflows/:workflowId/transform-blocks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;

      // Validate request body
      const blockData = insertTransformBlockSchema.parse(req.body);

      const block = await transformBlockService.createBlock(workflowId, userId, blockData);
      res.status(201).json({ success: true, data: block });
    } catch (error) {
      console.error("Error creating transform block:", error);
      const message = error instanceof Error ? error.message : "Failed to create transform block";

      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: "Invalid request data", details: error.errors });
      }

      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : message.includes("limit") ? 400 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/workflows/:workflowId/transform-blocks
   * List all transform blocks for a workflow
   */
  app.get('/api/workflows/:workflowId/transform-blocks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const blocks = await transformBlockService.listBlocks(workflowId, userId);
      res.json({ success: true, data: blocks });
    } catch (error) {
      console.error("Error listing transform blocks:", error);
      const message = error instanceof Error ? error.message : "Failed to list transform blocks";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/transform-blocks/:blockId
   * Get a single transform block
   */
  app.get('/api/transform-blocks/:blockId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { blockId } = req.params;
      const block = await transformBlockService.getBlock(blockId, userId);
      res.json({ success: true, data: block });
    } catch (error) {
      console.error("Error fetching transform block:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch transform block";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * PUT /api/transform-blocks/:blockId
   * Update a transform block
   */
  app.put('/api/transform-blocks/:blockId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { blockId } = req.params;
      const updateData = req.body;

      const block = await transformBlockService.updateBlock(blockId, userId, updateData);
      res.json({ success: true, data: block });
    } catch (error) {
      console.error("Error updating transform block:", error);
      const message = error instanceof Error ? error.message : "Failed to update transform block";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : message.includes("limit") ? 400 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * DELETE /api/transform-blocks/:blockId
   * Delete a transform block
   */
  app.delete('/api/transform-blocks/:blockId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const { blockId } = req.params;
      await transformBlockService.deleteBlock(blockId, userId);
      res.status(200).json({ success: true, message: "Transform block deleted" });
    } catch (error) {
      console.error("Error deleting transform block:", error);
      const message = error instanceof Error ? error.message : "Failed to delete transform block";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/transform-blocks/:blockId/test
   * Test a transform block with sample data
   */
  app.post('/api/transform-blocks/:blockId/test', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      // Check rate limit
      const rateCheck = checkTestRateLimit(userId);
      if (!rateCheck.allowed) {
        return res.status(429).json({ success: false, error: rateCheck.error });
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
      console.error("Error testing transform block:", error);
      const message = error instanceof Error ? error.message : "Failed to test transform block";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });
}
