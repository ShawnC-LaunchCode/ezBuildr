import { insertStepSchema } from "@shared/schema";
import type { InsertStep } from "@shared/schema";

import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { autoRevertToDraft } from "../middleware/autoRevertToDraft";
import { createLimiter } from "../middleware/rateLimiting";
import { sectionRepository } from "../repositories/SectionRepository";
import { stepRepository } from "../repositories/StepRepository";
import { stepService } from "../services/StepService";
import { asyncHandler } from "../utils/asyncHandler";
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
    const step = await stepRepository.findById(stepId);
    if (!step) {
      res.status(404).json({ message: "Step not found" });
      return;
    }
    const section = await sectionRepository.findById(step.sectionId);
    if (!section) {
      res.status(404).json({ message: "Section not found" });
      return;
    }
    // eslint-disable-next-line no-param-reassign -- Express middleware convention: augment req.params for downstream handlers
    req.params.workflowId = section.workflowId;
    next();
  } catch (error) {
    logger.error({ error }, "Error in lookupWorkflowIdFromStepMiddleware");
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
    const section = await sectionRepository.findById(sectionId);
    if (!section) {
      res.status(404).json({ message: "Section not found" });
      return;
    }
    // eslint-disable-next-line no-param-reassign -- Express middleware convention: augment req.params for downstream handlers
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
      const stepData = insertStepSchema.partial().parse(req.body) as Omit<InsertStep, 'sectionId'>;
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
// eslint-disable-next-line max-lines-per-function -- route registration functions are inherently long
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
      const stepData = insertStepSchema.partial().parse(req.body) as Omit<InsertStep, 'sectionId'>;
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
      await stepService.reorderStepsBySectionId(sectionId, userId, steps as { id: string; order: number }[]);
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
}

/**
 * Register step-related routes
 * Handles step CRUD operations and reordering
 */
export function registerStepRoutes(app: Express): void {
  registerWorkflowStepRoutes(app);
  registerSimplifiedStepRoutes(app);
}
