import express from "express";
import { z } from "zod";

import { hybridAuth } from "../middleware/auth";
import { lifecycleHookService } from "../services/scripting/LifecycleHookService";

import type { AuthRequest } from "../middleware/auth";

const router = express.Router();

// ===================================================================
// VALIDATION SCHEMAS
// ===================================================================

const createLifecycleHookSchema = z.object({
  workflowId: z.string().uuid(),
  sectionId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(255),
  phase: z.enum(["beforePage", "afterPage", "beforeFinalBlock", "afterDocumentsGenerated"]),
  language: z.enum(["javascript", "python"]),
  code: z.string().min(1).max(32768), // 32KB max
  inputKeys: z.array(z.string()).default([]),
  outputKeys: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
  timeoutMs: z.number().int().min(100).max(3000).default(1000),
  mutationMode: z.boolean().default(false),
});

const updateLifecycleHookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  phase: z.enum(["beforePage", "afterPage", "beforeFinalBlock", "afterDocumentsGenerated"]).optional(),
  language: z.enum(["javascript", "python"]).optional(),
  code: z.string().min(1).max(32768).optional(),
  inputKeys: z.array(z.string()).optional(),
  outputKeys: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  timeoutMs: z.number().int().min(100).max(3000).optional(),
  mutationMode: z.boolean().optional(),
});

const testHookSchema = z.object({
  testData: z.record(z.any()),
  context: z
    .object({
      workflowId: z.string().uuid().optional(),
      runId: z.string().uuid().optional(),
      phase: z.string().optional(),
      sectionId: z.string().uuid().optional(),
      userId: z.string().optional(),
      metadata: z.record(z.any()).optional(),
    })
    .optional(),
});

// ===================================================================
// LIFECYCLE HOOKS CRUD
// ===================================================================

/**
 * GET /api/workflows/:workflowId/lifecycle-hooks
 * List all lifecycle hooks for a workflow
 */
router.get(
  "/workflows/:workflowId/lifecycle-hooks",
  hybridAuth,
  async (req: AuthRequest, res) => {
    try {
      const { workflowId } = req.params;
      const userId = req.userId!;

      const hooks = await lifecycleHookService.listHooks(workflowId, userId);

      res.json({ success: true, data: hooks });
    } catch (error) {
      res.status(error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to list lifecycle hooks",
      });
    }
  }
);

/**
 * POST /api/workflows/:workflowId/lifecycle-hooks
 * Create a new lifecycle hook
 */
router.post(
  "/workflows/:workflowId/lifecycle-hooks",
  hybridAuth,
  async (req: AuthRequest, res) => {
    try {
      const { workflowId } = req.params;
      const userId = req.userId!;

      // Validate request body
      const validatedData = createLifecycleHookSchema.parse({
        ...req.body,
        workflowId,
      });

      const hook = await lifecycleHookService.createHook(workflowId, userId, validatedData);

      res.status(201).json({ success: true, data: hook });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.errors,
        });
      } else {
        res.status(error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500).json({
          success: false,
          error: error instanceof Error ? error.message : "Failed to create lifecycle hook",
        });
      }
    }
  }
);

/**
 * GET /api/lifecycle-hooks/:hookId
 * Get a single lifecycle hook by ID
 */
router.get("/lifecycle-hooks/:hookId", hybridAuth, async (req: AuthRequest, res) => {
  try {
    const { hookId } = req.params;
    const userId = req.userId!;

    // Note: We could add a specific get method to the service, but for now
    // we'll just list all and filter (or add getById to service later)
    // For simplicity, returning a 501 Not Implemented for now
    res.status(501).json({
      success: false,
      error: "Not implemented - use list endpoint",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get lifecycle hook",
    });
  }
});

/**
 * PUT /api/lifecycle-hooks/:hookId
 * Update a lifecycle hook
 */
router.put("/lifecycle-hooks/:hookId", hybridAuth, async (req: AuthRequest, res) => {
  try {
    const { hookId } = req.params;
    const userId = req.userId!;

    // Validate request body
    const validatedData = updateLifecycleHookSchema.parse(req.body);

    const hook = await lifecycleHookService.updateHook(hookId, userId, validatedData);

    res.json({ success: true, data: hook });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors,
      });
    } else {
      res.status(error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to update lifecycle hook",
      });
    }
  }
});

/**
 * DELETE /api/lifecycle-hooks/:hookId
 * Delete a lifecycle hook
 */
router.delete("/lifecycle-hooks/:hookId", hybridAuth, async (req: AuthRequest, res) => {
  try {
    const { hookId } = req.params;
    const userId = req.userId!;

    await lifecycleHookService.deleteHook(hookId, userId);

    res.json({ success: true });
  } catch (error) {
    res.status(error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete lifecycle hook",
    });
  }
});

/**
 * POST /api/lifecycle-hooks/:hookId/test
 * Test a lifecycle hook with sample data
 */
router.post("/lifecycle-hooks/:hookId/test", hybridAuth, async (req: AuthRequest, res) => {
  try {
    const { hookId } = req.params;
    const userId = req.userId!;

    // Validate request body
    const validatedData = testHookSchema.parse(req.body);

    const result = await lifecycleHookService.testHook(hookId, userId, validatedData);

    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.errors,
      });
    } else {
      res.status(error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to test lifecycle hook",
      });
    }
  }
});

// ===================================================================
// SCRIPT CONSOLE (Execution Logs)
// ===================================================================

/**
 * GET /api/runs/:runId/script-console
 * Get script execution logs for a run
 */
router.get("/runs/:runId/script-console", hybridAuth, async (req: AuthRequest, res) => {
  try {
    const { runId } = req.params;
    const userId = req.userId!;

    const logs = await lifecycleHookService.getExecutionLogs(runId, userId);

    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to get script console logs",
    });
  }
});

/**
 * DELETE /api/runs/:runId/script-console
 * Clear script execution logs for a run
 */
router.delete("/runs/:runId/script-console", hybridAuth, async (req: AuthRequest, res) => {
  try {
    const { runId } = req.params;
    const userId = req.userId!;

    await lifecycleHookService.clearExecutionLogs(runId, userId);

    res.json({ success: true });
  } catch (error) {
    res.status(error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to clear script console logs",
    });
  }
});

export default router;
