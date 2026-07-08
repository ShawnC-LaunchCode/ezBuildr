import express from "express";
import { z } from "zod";

import { hybridAuth } from "../middleware/auth";
import { documentHookService } from "../services/scripting/DocumentHookService";
import { asyncHandler } from '../utils/asyncHandler';
import { classifyRouteError } from '../utils/routeErrors';

import type { AuthRequest } from "../middleware/auth";

const router: express.Router = express.Router();

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
  testData: z.record(z.unknown()),
  context: z
    .object({
      workflowId: z.string().uuid().optional(),
      runId: z.string().uuid().optional(),
      phase: z.string().optional(),
      documentId: z.string().uuid().optional(),
      userId: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
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
  asyncHandler(async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const { workflowId } = req.params;
      if (!workflowId) {throw new Error("Workflow ID is required");}
      const userId = authReq.userId!;

      const hooks = await documentHookService.listHooks(workflowId, userId);

      res.json({ success: true, data: hooks });
    } catch (error) {
      const { status, message } = classifyRouteError(error, "Failed to list document hooks");
      res.status(status).json({ success: false, error: message });
    }
  })
);

/**
 * POST /api/workflows/:workflowId/document-hooks
 * Create a new document hook
 */
router.post(
  "/workflows/:workflowId/document-hooks",
  hybridAuth,
  asyncHandler(async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const { workflowId } = req.params;
      if (!workflowId) {throw new Error("Workflow ID is required");}
      const userId = authReq.userId!;

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
        const { status, message } = classifyRouteError(error, "Failed to create document hook");
        res.status(status).json({ success: false, error: message });
      }
    }
  })
);

/**
 * GET /api/document-hooks/:hookId
 * Get a single document hook by ID
 */
router.get("/document-hooks/:hookId", hybridAuth, asyncHandler(async (req, res) => {
  try {
    const _authReq = req as AuthRequest;
    const _hookId = req.params.hookId;
    const _userId = _authReq.userId!;

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
      error: "Failed to get document hook",
    });
  }
}));

/**
 * PUT /api/document-hooks/:hookId
 * Update a document hook
 */
router.put("/document-hooks/:hookId", hybridAuth, asyncHandler(async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const { hookId } = req.params;
    if (!hookId) {throw new Error("Hook ID is required");}
    const userId = authReq.userId!;

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
      const { status, message } = classifyRouteError(error, "Failed to update document hook");
      res.status(status).json({ success: false, error: message });
    }
  }
}));

/**
 * DELETE /api/document-hooks/:hookId
 * Delete a document hook
 */
router.delete("/document-hooks/:hookId", hybridAuth, asyncHandler(async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const { hookId } = req.params;
    if (!hookId) {throw new Error("Hook ID is required");}
    const userId = authReq.userId!;

    await documentHookService.deleteHook(hookId, userId);

    res.json({ success: true });
  } catch (error) {
    const { status, message } = classifyRouteError(error, "Failed to delete document hook");
    res.status(status).json({ success: false, error: message });
  }
}));

/**
 * POST /api/document-hooks/:hookId/test
 * Test a document hook with sample data
 */
router.post("/document-hooks/:hookId/test", hybridAuth, asyncHandler(async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const { hookId } = req.params;
    if (!hookId) {throw new Error("Hook ID is required");}
    const userId = authReq.userId!;

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
      const { status, message } = classifyRouteError(error, "Failed to test document hook");
      res.status(status).json({ success: false, error: message });
    }
  }
}));

export default router;
