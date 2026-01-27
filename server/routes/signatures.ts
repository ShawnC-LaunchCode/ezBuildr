import express from "express";
import { z } from "zod";

import { logger } from "../logger";
import { hybridAuth, type AuthRequest } from "../middleware/auth";
import { signatureRequestService } from "../services";
import { resumeRunFromNode } from "../services/runs";
import { asyncHandler } from "../utils/asyncHandler";
import { createError } from "../utils/errors";

const router = express.Router();

/**
 * Stage 14: E-Signature API Routes
 * Handles document signing workflows
 */

// Validation schemas
const signActionSchema = z.object({
  action: z.enum(['sign', 'decline']),
  reason: z.string().optional(),
});

/**
 * GET /api/signatures/requests/:id
 * Get signature request by ID (authenticated)
 */
router.get("/requests/:id", hybridAuth, asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = (req as AuthRequest).userId;
    if (!userId) {throw new Error("Unauthorized");}

    const request = await signatureRequestService.getSignatureRequest(id, userId);

    res.json(request);
  } catch (error) {
    next(error);
  }
}));

/**
 * GET /api/signatures/requests/project/:projectId
 * Get pending signature requests for a project
 */
router.get("/requests/project/:projectId", hybridAuth, asyncHandler(async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = (req as AuthRequest).userId;
    if (!userId) {throw new Error("Unauthorized");}

    const requests = await signatureRequestService.getPendingRequestsByProject(
      projectId,
      userId
    );

    res.json(requests);
  } catch (error) {
    next(error);
  }
}));

/**
 * GET /api/signatures/requests/:id/events
 * Get signature events for a request
 */
router.get("/requests/:id/events", hybridAuth, asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = (req as AuthRequest).userId;
    if (!userId) {throw new Error("Unauthorized");}

    const events = await signatureRequestService.getSignatureEvents(id, userId);

    res.json(events);
  } catch (error) {
    next(error);
  }
}));

/**
 * GET /api/sign/:token
 * Get signature request by token (public, no auth)
 * Used by the signing portal
 */
router.get("/sign/:token", asyncHandler(async (req, res, next) => {
  try {
    const { token } = req.params;

    const request = await signatureRequestService.getSignatureRequestByToken(token);

    // Don't expose sensitive fields
    const publicData = {
      id: request.id,
      signerEmail: request.signerEmail,
      signerName: request.signerName,
      status: request.status,
      message: request.message,
      documentUrl: request.documentUrl,
      expiresAt: request.expiresAt,
      provider: request.provider,
    };

    res.json(publicData);
  } catch (error) {
    next(error);
  }
}));

/**
 * POST /api/sign/:token
 * Sign or decline a document (public, no auth)
 *
 * Body: { action: 'sign' | 'decline', reason?: string }
 */
router.post("/sign/:token", asyncHandler(async (req, res, next) => {
  try {
    const { token } = req.params;

    // Validate request body
    const result = signActionSchema.safeParse(req.body);
    if (!result.success) {
      throw createError.validation("Invalid request body", result.error.errors);
    }

    const { action, reason } = result.data;

    let request;
    if (action === 'sign') {
      request = await signatureRequestService.signDocument(token);

      // Resume the workflow run
      try {
        await resumeRunFromNode(request.runId, request.nodeId);
      } catch (resumeError) {
        logger.error({ resumeError, runId: request.runId, nodeId: request.nodeId }, 'Failed to resume workflow after signing');
        // Don't fail the signing if resume fails
      }
    } else {
      request = await signatureRequestService.declineSignature(token, reason);
    }

    res.json({
      success: true,
      status: request.status,
      message: action === 'sign'
        ? 'Document signed successfully'
        : 'Signature declined',
    });
  } catch (error) {
    next(error);
  }
}));

export default router;
