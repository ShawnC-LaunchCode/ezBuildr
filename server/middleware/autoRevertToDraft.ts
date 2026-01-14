import { createLogger } from "../logger";
import { workflowService } from "../services/WorkflowService";

import type { Request, Response, NextFunction } from "express";

const logger = createLogger({ module: "auto-revert-middleware" });

/**
 * Middleware to automatically revert workflows to draft when structural edits are made
 * Applies to: sections, steps, logic rules, transform blocks
 * Does NOT apply to: workflow settings/metadata
 */
export async function autoRevertToDraft(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Only apply to write operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    // Extract userId from session
    const userId = req.user?.claims?.sub;
    if (!userId) {
      // If no user, skip middleware (auth middleware will handle)
      return next();
    }

    // Extract workflowId from route params
    // Could be in params.workflowId or we might need to look it up from section/step ID
    const { workflowId } = req.params;

    if (!workflowId) {
      // No workflowId in params, skip middleware
      return next();
    }

    // Auto-revert to draft if workflow is active/archived
    const wasReverted = await workflowService.ensureDraftForEditing(workflowId, userId);

    if (wasReverted) {
      // Set custom header to notify frontend
      res.setHeader('X-Workflow-Auto-Reverted', 'true');
      logger.info({ workflowId, userId, path: req.path }, "Auto-reverted workflow to draft");
    }

    next();
  } catch (error) {
    // Log error but don't block the request
    // The route handler will handle auth/not found errors
    logger.debug({ error, path: req.path }, "Auto-revert middleware error (non-blocking)");
    next();
  }
}
