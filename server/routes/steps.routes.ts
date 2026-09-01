import { insertStepSchema } from "@shared/schema";
import type { InsertStep } from "@shared/schema";

import { createLogger } from "../logger";
import { hybridAuth, optionalHybridAuth, type AuthRequest } from '../middleware/auth';
import { autoRevertToDraft } from "../middleware/autoRevertToDraft";
import { createLimiter } from "../middleware/rateLimiting";
import { creatorOrRunTokenAuth, type RunAuthRequest } from '../middleware/runTokenAuth';
import { pageRepository } from "../repositories/PageRepository";
import { stepRepository } from "../repositories/StepRepository";
import { stepService } from "../services/StepService";
import { workflowService } from "../services/WorkflowService";
import { asyncHandler } from "../utils/asyncHandler";
import { withCurrentTenant } from "../utils/rlsContext";
import { classifyRouteError } from "../utils/routeErrors";
import { validateAndNormalizeConfig } from "../utils/stepConfigUtils";

import type { Express, Request, Response, NextFunction } from "express";
import type { StepConfig } from "@shared/types/stepConfigs";

const logger = createLogger({ module: "steps-routes" });

const UNAUTHORIZED_MSG = "Unauthorized - no user ID";

function rejectInvalidStepRequest(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "Invalid step input";
  res.status(400).json({ message: `Validation error: ${message}` });
}

/** Validate the canonical type/config pair before autoRevert can write. */
function validateStepCreateRequest(req: Request, res: Response, next: NextFunction): void {
  try {
    const data = insertStepSchema.partial().parse(req.body);
    if (data.type === undefined) {
      throw new Error("Step type is required at type");
    }
    validateAndNormalizeConfig(data.type, data.config as StepConfig, { strict: true });
    next();
  } catch (error) {
    rejectInvalidStepRequest(res, error);
  }
}

/** Validate config/type updates atomically before autoRevert can write. */
function validateStepUpdateRequest(req: Request, res: Response, next: NextFunction): void {
  try {
    const data = insertStepSchema.partial().parse(req.body);
    const existingType = res.locals.stepType as string | undefined;
    if (data.type !== undefined && data.type !== existingType && data.config === undefined) {
      throw new Error(`replacement config is required when changing type to "${data.type}" at config`);
    }
    if (data.config !== undefined) {
      const effectiveType = data.type ?? existingType;
      if (effectiveType === undefined) {
        throw new Error("Step type is required at type");
      }
      validateAndNormalizeConfig(effectiveType, data.config as StepConfig, { strict: true });
    }
    next();
  } catch (error) {
    rejectInvalidStepRequest(res, error);
  }
}
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
    const userId = (req as AuthRequest).userId;
    if (!stepId) {
      return next();
    }
    // RLS-5: `steps`/`pages` are RLS-covered through the ownership-derived
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
      const page = await pageRepository.findById(step.pageId, tx);
      if (!page) {
        return { error: "Page not found" as const };
      }
      if (!userId) {
        return { error: "Step not found" as const };
      }
      try {
        await workflowService.verifyAccess(page.workflowId, userId, 'edit', tx);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Access denied')) {
          return { accessDenied: true as const };
        }
        return { error: "Step not found" as const };
      }
      return { workflowId: page.workflowId, stepType: step.type };
    });
    if ('accessDenied' in resolved) {
      res.status(403).json({ message: "Access denied - insufficient permissions for this workflow" });
      return;
    }
    if ('error' in resolved) {
      res.status(404).json({ message: resolved.error });
      return;
    }

    req.params.workflowId = resolved.workflowId;
    res.locals.stepType = resolved.stepType;
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
 * Middleware helper: Look up workflowId from pageId before auto-revert
 * This allows auto-revert to work on simplified endpoints (without workflowId in path)
 */
async function lookupWorkflowIdFromPageMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { pageId } = req.params;
    const userId = (req as AuthRequest).userId;
    if (!pageId) {
      return next();
    }
    // RLS-5: `pages` is RLS-covered via its parent workflow's
    // ownership-derived policy — read inside the tenant-scoped transaction.
    const resolved = await withCurrentTenant(async (tx) => {
      const page = await pageRepository.findById(pageId, tx);
      if (!page || !userId) { return { page: undefined }; }
      try {
        await workflowService.verifyAccess(page.workflowId, userId, 'edit', tx);
      } catch (error) {
        return error instanceof Error && error.message.startsWith('Access denied')
          ? { accessDenied: true as const }
          : { page: undefined };
      }
      return { page };
    });
    if ('accessDenied' in resolved) {
      res.status(403).json({ message: "Access denied - insufficient permissions for this workflow" });
      return;
    }
    if (!resolved.page) {
      res.status(404).json({ message: "Page not found" });
      return;
    }

    req.params.workflowId = resolved.page.workflowId;
    next();
  } catch (error) {
    logger.error({ error }, "Error in lookupWorkflowIdFromPageMiddleware");
    next(error);
  }
}

/** Conceal a missing/foreign/mismatched page before request-body validation. */
async function verifyScopedPageMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { pageId, workflowId } = req.params;
    const userId = (req as AuthRequest).userId;
    if (!pageId || !workflowId) {
      return next();
    }
    const access = await withCurrentTenant(async (tx) => {
      const page = await pageRepository.findById(pageId, tx);
      if (!page || page.workflowId !== workflowId || !userId) { return 'not-found' as const; }
      try {
        await workflowService.verifyAccess(workflowId, userId, 'edit', tx);
        return 'permitted' as const;
      } catch (error) {
        return error instanceof Error && error.message.startsWith('Access denied')
          ? 'denied' as const
          : 'not-found' as const;
      }
    });
    if (access === 'denied') {
      res.status(403).json({ message: "Access denied - insufficient permissions for this workflow" });
      return;
    }
    if (access === 'not-found') {
      res.status(404).json({ message: "Page not found" });
      return;
    }
    next();
  } catch (error) {
    logger.error({ error }, "Error in verifyScopedPageMiddleware");
    next(error);
  }
}

/**
 * Register workflow-scoped step routes (with workflowId in path)
 */
function registerWorkflowStepRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/pages/:pageId/steps
   * Create a new step
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.post('/api/workflows/:workflowId/pages/:pageId/steps', hybridAuth, createLimiter, verifyScopedPageMiddleware, validateStepCreateRequest, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId, pageId } = req.params;
      const stepData = insertStepSchema.partial().parse(req.body) as Omit<InsertStep, 'pageId' | 'workflowId'>;
      const step = await stepService.createStep(workflowId, pageId, userId, stepData);
      res.status(201).json(step);
    } catch (error) {
      logger.error({ error }, "Error creating step");
      const { status, message } = classifyRouteError(error, "Failed to create step");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/pages/:pageId/steps
   * Get all steps for a page
   */
  app.get('/api/workflows/:workflowId/pages/:pageId/steps', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId, pageId } = req.params;
      const steps = await stepService.getSteps(workflowId, pageId, userId);
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
   * PUT /api/workflows/:workflowId/pages/:pageId/steps/reorder
   * Reorder steps within a page
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.put('/api/workflows/:workflowId/pages/:pageId/steps/reorder', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId, pageId } = req.params;
      const { steps } = req.body as { steps: unknown };
      if (!Array.isArray(steps)) {
        return res.status(400).json({ message: "Invalid steps array" });
      }
      await stepService.reorderSteps(workflowId, pageId, userId, steps as { id: string; order: number }[]);
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
   * GET /api/pages/:pageId/steps
   * Get all steps for a page (workflow looked up automatically)
   */
  app.get('/api/pages/:pageId/steps', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { pageId } = req.params;
      const steps = await stepService.getStepsByPageId(pageId, userId);
      res.json(steps);
    } catch (error) {
      logger.error({ error }, "Error fetching steps");
      const { status, message } = classifyRouteError(error, "Failed to fetch steps");
      res.status(status).json({ message });
    }
  }));

  /**
   * POST /api/pages/:pageId/steps
   * Create a new step (workflow looked up automatically)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookup
  app.post('/api/pages/:pageId/steps', hybridAuth, createLimiter, lookupWorkflowIdFromPageMiddleware, validateStepCreateRequest, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { pageId } = req.params;
      const stepData = insertStepSchema.partial().parse(req.body) as Omit<InsertStep, 'pageId' | 'workflowId'>;
      const step = await stepService.createStepByPageId(pageId, userId, stepData);
      res.status(201).json(step);
    } catch (error) {
      logger.error({ error }, "Error creating step");
      const { status, message } = classifyRouteError(error, "Failed to create step");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/pages/:pageId/steps/reorder
   * Reorder steps (workflow looked up automatically)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookup
  app.put('/api/pages/:pageId/steps/reorder', hybridAuth, lookupWorkflowIdFromPageMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { pageId } = req.params;
      const { steps } = req.body as { steps: unknown };
      if (!Array.isArray(steps)) {
        return res.status(400).json({ message: "Invalid steps array" });
      }
      // Validate each entry's id is a UUID and order is a finite number before
      // touching the DB (mirrors the pages/reorder guard).
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
      await stepService.reorderStepsByPageId(pageId, userId, steps as Array<{ id: string; order: number }>);
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
  app.put('/api/steps/:stepId', hybridAuth, lookupWorkflowIdFromStepMiddleware, validateStepUpdateRequest, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
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
   * Duplicate a step into the same page, immediately after the source
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
