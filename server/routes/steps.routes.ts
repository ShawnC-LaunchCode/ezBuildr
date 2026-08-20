import { insertStepSchema } from "@shared/schema";
import type { InsertStep } from "@shared/schema";

import { createLogger } from "../logger";
import { hybridAuth, optionalHybridAuth, type AuthRequest } from '../middleware/auth';
import { autoRevertToDraft } from "../middleware/autoRevertToDraft";
import { createLimiter } from "../middleware/rateLimiting";
import { creatorOrRunTokenAuth, type RunAuthRequest } from '../middleware/runTokenAuth';
import { sectionRepository } from "../repositories/SectionRepository";
import { stepRepository } from "../repositories/StepRepository";
import { stepService } from "../services/StepService";
import { asyncHandler } from "../utils/asyncHandler";
import { withCurrentTenant } from "../utils/rlsContext";
import { classifyRouteError } from "../utils/routeErrors";

import type { Express, Request, Response, NextFunction } from "express";

const logger = createLogger({ module: "steps-routes" });

const UNAUTHORIZED_MSG = "Unauthorized - no user ID";
/**
 * Middleware helper: Look up workflowId from stepId before auto-revert
 * This allows auto-revert to work on simplified endpoints (without workflowId in path)
 */
async function lookupWorkflowIdFromStepMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { stepId } = req.params;
    if (!stepId) {
      return next();
    }
    // RLS-5: `steps`/`sections` are RLS-covered through the ownership-derived
    // policy on their parent workflow, so these reads must run inside the
    // tenant-scoped transaction `hybridAuth` already established — on the bare
    // pool they return nothing and this middleware 404s a step that exists.
    // Route middleware is a THIRD place this class of gap lives, alongside
    // services and test fixtures.
    const resolved = await withCurrentTenant(async (tx) => {
      const step = await stepRepository.findById(stepId, tx);
      if (!step) {
        return { error: "Step not found" as const };
      }
      const section = await sectionRepository.findById(step.sectionId, tx);
      if (!section) {
        return { error: "Section not found" as const };
      }
      return { workflowId: section.workflowId };
    });
    if ('error' in resolved) {
      res.status(404).json({ message: resolved.error });
      return;
    }

    req.params.workflowId = resolved.workflowId;
    next();
  } catch (error) {
    logger.error({ error }, "Error in lookupWorkflowIdFromStepMiddleware");
    next(error);
  }
}

/**
 * Middleware helper: Look up workflowId from stepId before auto-revert, for
 * the restore route only. Must find the step even when soft-deleted
 * (ICW2-B1) — unlike `lookupWorkflowIdFromStepMiddleware`, which uses the
 * filtered `findById` and would 404 before the restore ever runs.
 */
async function lookupWorkflowIdFromStepIncludingDeletedMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { stepId } = req.params;
    if (!stepId) {
      return next();
    }
    // RLS-5: same tenant-scoping requirement as
    // `lookupWorkflowIdFromStepMiddleware` above.
    const step = await withCurrentTenant((tx) =>
      stepRepository.findByIdIncludingDeleted(stepId, tx));
    if (!step) {
      res.status(404).json({ message: "Step not found" });
      return;
    }

    req.params.workflowId = step.workflowId;
    next();
  } catch (error) {
    logger.error({ error }, "Error in lookupWorkflowIdFromStepIncludingDeletedMiddleware");
    next(error);
  }
}

/**
 * Middleware helper: Look up workflowId from sectionId before auto-revert
 * This allows auto-revert to work on simplified endpoints (without workflowId in path)
 */
async function lookupWorkflowIdFromSectionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { sectionId } = req.params;
    if (!sectionId) {
      return next();
    }
    // RLS-5: `sections` is RLS-covered via its parent workflow's
    // ownership-derived policy — read inside the tenant-scoped transaction.
    const section = await withCurrentTenant((tx) =>
      sectionRepository.findById(sectionId, tx));
    if (!section) {
      res.status(404).json({ message: "Section not found" });
      return;
    }

    req.params.workflowId = section.workflowId;
    next();
  } catch (error) {
    logger.error({ error }, "Error in lookupWorkflowIdFromSectionMiddleware");
    next(error);
  }
}

/**
 * Register workflow-scoped step routes (with workflowId in path)
 */
function registerWorkflowStepRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/sections/:sectionId/steps
   * Create a new step
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.post('/api/workflows/:workflowId/sections/:sectionId/steps', hybridAuth, createLimiter, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId, sectionId } = req.params;
      const stepData = insertStepSchema.partial().parse(req.body) as Omit<InsertStep, 'sectionId' | 'workflowId'>;
      const step = await stepService.createStep(workflowId, sectionId, userId, stepData);
      res.status(201).json(step);
    } catch (error) {
      logger.error({ error }, "Error creating step");
      const { status, message } = classifyRouteError(error, "Failed to create step");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/sections/:sectionId/steps
   * Get all steps for a section
   */
  app.get('/api/workflows/:workflowId/sections/:sectionId/steps', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId, sectionId } = req.params;
      const steps = await stepService.getSteps(workflowId, sectionId, userId);
      res.json(steps);
    } catch (error) {
      logger.error({ error }, "Error fetching steps");
      const { status, message } = classifyRouteError(error, "Failed to fetch steps");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/steps
   * Get all steps for a workflow. Used by the runner, including public runs
   * authenticated with a run token.
   */
  app.get('/api/workflows/:workflowId/steps', optionalHybridAuth, creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const userId = (req as AuthRequest).userId;
      const runAuth = (req as RunAuthRequest).runAuth;

      if (runAuth != null) {
        if (runAuth.workflowId !== workflowId) {
          return res.status(403).json({ message: "Access denied - run token is for a different workflow" });
        }
      } else if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      } else {
        await stepService.verifyWorkflowAccess(workflowId, userId);
      }

      const steps = await stepService.getWorkflowSteps(workflowId);
      res.json(steps);
    } catch (error) {
      logger.error({ error }, "Error fetching workflow steps");
      const { status, message } = classifyRouteError(error, "Failed to fetch workflow steps");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/sections/:sectionId/steps/reorder
   * Reorder steps within a section
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.put('/api/workflows/:workflowId/sections/:sectionId/steps/reorder', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId, sectionId } = req.params;
      const { steps } = req.body as { steps: unknown };
      if (!Array.isArray(steps)) {
        return res.status(400).json({ message: "Invalid steps array" });
      }
      await stepService.reorderSteps(workflowId, sectionId, userId, steps as { id: string; order: number }[]);
      res.status(200).json({ message: "Steps reordered successfully" });
    } catch (error) {
      logger.error({ error }, "Error reordering steps");
      const { status, message } = classifyRouteError(error, "Failed to reorder steps");
      res.status(status).json({ message });
    }
  }));
}

/**
 * Register simplified step routes (without workflowId in path)
 */

function registerSimplifiedStepRoutes(app: Express): void {
  /**
   * GET /api/sections/:sectionId/steps
   * Get all steps for a section (workflow looked up automatically)
   */
  app.get('/api/sections/:sectionId/steps', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { sectionId } = req.params;
      const steps = await stepService.getStepsBySectionId(sectionId, userId);
      res.json(steps);
    } catch (error) {
      logger.error({ error }, "Error fetching steps");
      const { status, message } = classifyRouteError(error, "Failed to fetch steps");
      res.status(status).json({ message });
    }
  }));

  /**
   * POST /api/sections/:sectionId/steps
   * Create a new step (workflow looked up automatically)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookup
  app.post('/api/sections/:sectionId/steps', hybridAuth, createLimiter, lookupWorkflowIdFromSectionMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { sectionId } = req.params;
      const stepData = insertStepSchema.partial().parse(req.body) as Omit<InsertStep, 'sectionId' | 'workflowId'>;
      const step = await stepService.createStepBySectionId(sectionId, userId, stepData);
      res.status(201).json(step);
    } catch (error) {
      logger.error({ error }, "Error creating step");
      const { status, message } = classifyRouteError(error, "Failed to create step");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/sections/:sectionId/steps/reorder
   * Reorder steps (workflow looked up automatically)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookup
  app.put('/api/sections/:sectionId/steps/reorder', hybridAuth, lookupWorkflowIdFromSectionMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { sectionId } = req.params;
      const { steps } = req.body as { steps: unknown };
      if (!Array.isArray(steps)) {
        return res.status(400).json({ message: "Invalid steps array" });
      }
      // Validate each entry's id is a UUID and order is a finite number before
      // touching the DB (mirrors the sections/reorder guard).
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const entry of steps) {
        const step = entry as { id?: unknown; order?: unknown };
        if (typeof step.id !== 'string' || !uuidRegex.test(step.id)) {
          return res.status(400).json({
            message: "Invalid step ID format",
            details: "Step ID must be a valid UUID",
          });
        }
        if (typeof step.order !== 'number' || !Number.isFinite(step.order)) {
          return res.status(400).json({ message: "Step order must be a finite number" });
        }
      }
      await stepService.reorderStepsBySectionId(sectionId, userId, steps as Array<{ id: string; order: number }>);
      res.status(200).json({ message: "Steps reordered successfully" });
    } catch (error) {
      logger.error({ error }, "Error reordering steps");
      const { status, message } = classifyRouteError(error, "Failed to reorder steps");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/steps/:stepId
   * Get a single step (workflow looked up automatically)
   */
  app.get('/api/steps/:stepId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { stepId } = req.params;
      const step = await stepService.getStepById(stepId, userId);
      res.json(step);
    } catch (error) {
      logger.error({ error }, "Error fetching step");
      const { status, message } = classifyRouteError(error, "Failed to fetch step");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/steps/:stepId/delete-impact
   * Preview the answers/runs that would be permanently destroyed by
   * deleting this step (workflow looked up automatically). Read-only —
   * used to gate the client's destructive-confirm dialog (ICW2-13).
   */
  app.get('/api/steps/:stepId/delete-impact', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { stepId } = req.params;
      const impact = await stepService.getStepDeleteImpactById(stepId, userId);
      res.json(impact);
    } catch (error) {
      logger.error({ error }, "Error fetching step delete impact");
      const { status, message } = classifyRouteError(error, "Failed to fetch step delete impact");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/steps/:stepId
   * Update a step (workflow looked up automatically)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookup
  app.put('/api/steps/:stepId', hybridAuth, lookupWorkflowIdFromStepMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { stepId } = req.params;
      const updateData = insertStepSchema.partial().parse(req.body);
      const updatedStep = await stepService.updateStepById(stepId, userId, updateData);
      res.json(updatedStep);
    } catch (error) {
      logger.error({ error }, "Error updating step");
      const { status, message } = classifyRouteError(error, "Failed to update step");
      res.status(status).json({ message });
    }
  }));

  /**
   * DELETE /api/steps/:stepId
   * Delete a step (workflow looked up automatically)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookup
  app.delete('/api/steps/:stepId', hybridAuth, lookupWorkflowIdFromStepMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { stepId } = req.params;
      await stepService.deleteStepById(stepId, userId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error deleting step");
      const { status, message } = classifyRouteError(error, "Failed to delete step");
      res.status(status).json({ message });
    }
  }));

  /**
   * POST /api/steps/:stepId/duplicate
   * Duplicate a step into the same section, immediately after the source
   * (workflow looked up automatically). ICW2-B5.
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookup
  app.post('/api/steps/:stepId/duplicate', hybridAuth, createLimiter, lookupWorkflowIdFromStepMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { stepId } = req.params;
      const step = await stepService.duplicateStep(stepId, userId);
      res.status(201).json(step);
    } catch (error) {
      logger.error({ error }, "Error duplicating step");
      const { status, message } = classifyRouteError(error, "Failed to duplicate step");
      res.status(status).json({ message });
    }
  }));

  /**
   * POST /api/steps/:stepId/restore
   * Restore a previously soft-deleted step (workflow looked up
   * automatically). Requires edit access. Restore UI is deferred — this is
   * server-side only (ICW2-B1).
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookup
  app.post('/api/steps/:stepId/restore', hybridAuth, createLimiter, lookupWorkflowIdFromStepIncludingDeletedMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { stepId } = req.params;
      const step = await stepService.restoreStep(stepId, userId);
      res.json(step);
    } catch (error) {
      logger.error({ error }, "Error restoring step");
      const { status, message } = classifyRouteError(error, "Failed to restore step");
      res.status(status).json({ message });
    }
  }));
}

/**
 * Register step-related routes
 * Handles step CRUD operations and reordering
 */
export function registerStepRoutes(app: Express): void {
  registerWorkflowStepRoutes(app);
  registerSimplifiedStepRoutes(app);
}
