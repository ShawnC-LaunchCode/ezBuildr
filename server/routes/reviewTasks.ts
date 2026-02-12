import { Router } from "express";
import { z } from "zod";

import { logger } from "../logger";
import { hybridAuth } from "../middleware/auth";
import { reviewTaskService } from "../services";
import { resumeRunFromNode } from "../services/runs";
import { asyncHandler } from "../utils/asyncHandler";

import type { AuthRequest } from "../middleware/auth";

const router = Router();

/**
 * Stage 14: Review Task API Routes
 * Handles review gates for workflow approval/rejection
 */

// Validation schemas
const decisionSchema = z.object({
  decision: z.enum(['approved', 'changes_requested', 'rejected']),
  comment: z.string().optional(),
});

/**
 * GET /api/review/tasks/:id
 * Get review task by ID
 */
router.get("/tasks/:id", hybridAuth, asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthRequest;
    const userId = authReq.userId ?? "";

    const task = await reviewTaskService.getReviewTask(id, userId);

    // Include related run and workflow info
    // TODO: Enhance to include document URLs and run data

    res.json(task);
  } catch (error) {
    next(error);
  }
}));

/**
 * GET /api/review/tasks/project/:projectId
 * Get pending review tasks for a project
 */
router.get("/tasks/project/:projectId", hybridAuth, asyncHandler(async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const authReq = req as AuthRequest;
    const userId = authReq.userId ?? "";

    const tasks = await reviewTaskService.getPendingTasksByProject(projectId, userId);

    res.json(tasks);
  } catch (error) {
    next(error);
  }
}));

/**
 * GET /api/review/my-tasks
 * Get review tasks assigned to the current user
 */
router.get("/my-tasks", hybridAuth, asyncHandler(async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.userId ?? "";

    const tasks = await reviewTaskService.getTasksForReviewer(userId);

    res.json(tasks);
  } catch (error) {
    next(error);
  }
}));

/**
 * POST /api/review/tasks/:id/decision
 * Make a decision on a review task
 *
 * Body: { decision: 'approved' | 'changes_requested' | 'rejected', comment?: string }
 */
router.post("/tasks/:id/decision", hybridAuth, asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthRequest;
    const userId = authReq.userId ?? "";

    // Validate request body
    const result = decisionSchema.safeParse(req.body);
    if (!result.success) {
      const validationError = new Error("Invalid request body");
      (validationError as Record<string, unknown>).status = 400;
      throw validationError;
    }

    const { decision, comment } = result.data;

    // Make decision
    const task = await reviewTaskService.makeDecision(
      id,
      userId,
      decision,
      comment
    );

    // If approved, resume the workflow run
    if (decision === 'approved') {
      try {
        await resumeRunFromNode(task.runId, task.nodeId);
      } catch (resumeError) {
        logger.error({ resumeError, runId: task.runId, nodeId: task.nodeId }, 'Failed to resume workflow after approval');
        // Don't fail the approval if resume fails
        // The task is still marked as approved
      }
    }

    res.json(task);
  } catch (error) {
    next(error);
  }
}));

export default router;
