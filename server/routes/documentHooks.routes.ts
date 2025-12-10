import express from "express";
import { documentHookService } from "../services/scripting/DocumentHookService";
import { hybridAuth } from "../middleware/auth";
import { z } from "zod";
import type { AuthRequest } from "../middleware/auth";

const router = express.Router();

// ===================================================================
// VALIDATION SCHEMAS
// ===================================================================

const createDocumentHookSchema = z.object({
  workflowId: z.string().uuid(),
  documentId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(255),
  phase: z.enum(["beforeGeneration", "afterGeneration"]),
  language: z.enum(["javascript", "python"]),
  code: z.string().min(1).max(32768), // 32KB max
  inputKeys: z.array(z.string()).default([]),
  outputKeys: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
  timeoutMs: z.number().int().min(100).max(3000).default(3000),
});

const updateDocumentHookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  phase: z.enum(["beforeGeneration", "afterGeneration"]).optional(),
  language: z.enum(["javascript", "python"]).optional(),
  code: z.string().min(1).max(32768).optional(),
  inputKeys: z.array(z.string()).optional(),
  outputKeys: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  timeoutMs: z.number().int().min(100).max(3000).optional(),
});

const testHookSchema = z.object({
  testData: z.record(z.any()),
  context: z
    .object({
      workflowId: z.string().uuid().optional(),
      runId: z.string().uuid().optional(),
      phase: z.string().optional(),
      documentId: z.string().uuid().optional(),
      userId: z.string().optional(),
      metadata: z.record(z.any()).optional(),
    })
    .optional(),
});

// ===================================================================
// DOCUMENT HOOKS CRUD
// ===================================================================

/**
 * GET /api/workflows/:workflowId/document-hooks
 * List all document hooks for a workflow
 */
router.get(
  "/workflows/:workflowId/document-hooks",
  hybridAuth,
  async (req: AuthRequest, res) => {
    try {
      const { workflowId } = req.params;
      const userId = req.userId!;

      const hooks = await documentHookService.listHooks(workflowId, userId);

      res.json({ success: true, data: hooks });
    } catch (error) {
      res.status(error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to list document hooks",
      });
    }
  }
);

/**
 * POST /api/workflows/:workflowId/document-hooks
 * Create a new document hook
 */
router.post(
  "/workflows/:workflowId/document-hooks",
  hybridAuth,
  async (req: AuthRequest, res) => {
    try {
      const { workflowId } = req.params;
      const userId = req.userId!;

      // Validate request body
      const validatedData = createDocumentHookSchema.parse({
        ...req.body,
        workflowId,
      });

      const hook = await documentHookService.createHook(workflowId, userId, validatedData);

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
          error: error instanceof Error ? error.message : "Failed to create document hook",
        });
      }
    }
  }
);

/**
 * GET /api/document-hooks/:hookId
 * Get a single document hook by ID
 */
router.get("/document-hooks/:hookId", hybridAuth, async (req: AuthRequest, res) => {
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
      error: error instanceof Error ? error.message : "Failed to get document hook",
    });
  }
});

/**
 * PUT /api/document-hooks/:hookId
 * Update a document hook
 */
router.put("/document-hooks/:hookId", hybridAuth, async (req: AuthRequest, res) => {
  try {
    const { hookId } = req.params;
    const userId = req.userId!;

    // Validate request body
    const validatedData = updateDocumentHookSchema.parse(req.body);

    const hook = await documentHookService.updateHook(hookId, userId, validatedData);

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
        error: error instanceof Error ? error.message : "Failed to update document hook",
      });
    }
  }
});

/**
 * DELETE /api/document-hooks/:hookId
 * Delete a document hook
 */
router.delete("/document-hooks/:hookId", hybridAuth, async (req: AuthRequest, res) => {
  try {
    const { hookId } = req.params;
    const userId = req.userId!;

    await documentHookService.deleteHook(hookId, userId);

    res.json({ success: true });
  } catch (error) {
    res.status(error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete document hook",
    });
  }
});

/**
 * POST /api/document-hooks/:hookId/test
 * Test a document hook with sample data
 */
router.post("/document-hooks/:hookId/test", hybridAuth, async (req: AuthRequest, res) => {
  try {
    const { hookId } = req.params;
    const userId = req.userId!;

    // Validate request body
    const validatedData = testHookSchema.parse(req.body);

    const result = await documentHookService.testHook(hookId, userId, validatedData);

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
        error: error instanceof Error ? error.message : "Failed to test document hook",
      });
    }
  }
});

export default router;
