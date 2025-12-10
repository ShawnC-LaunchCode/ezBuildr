import type { Express, Request, Response, NextFunction } from "express";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { insertStepSchema } from "@shared/schema";
import { stepService } from "../services/StepService";
import { sectionRepository } from "../repositories/SectionRepository";
import { stepRepository } from "../repositories/StepRepository";
import { z } from "zod";
import { createLogger } from "../logger";
import { autoRevertToDraft } from "../middleware/autoRevertToDraft";

const logger = createLogger({ module: "steps-routes" });

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

    // Add workflowId to params so autoRevertToDraft can access it
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

    // Add workflowId to params so autoRevertToDraft can access it
    req.params.workflowId = section.workflowId;
    next();
  } catch (error) {
    logger.error({ error }, "Error in lookupWorkflowIdFromSectionMiddleware");
    next(error);
  }
}

/**
 * Register step-related routes
 * Handles step CRUD operations and reordering
 */
export function registerStepRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/sections/:sectionId/steps
   * Create a new step
   */
  app.post('/api/workflows/:workflowId/sections/:sectionId/steps', hybridAuth, autoRevertToDraft, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId, sectionId } = req.params;
      const stepData = req.body;

      const step = await stepService.createStep(workflowId, sectionId, userId, stepData);
      res.status(201).json(step);
    } catch (error) {
      logger.error({ error }, "Error creating step");
      const message = error instanceof Error ? error.message : "Failed to create step";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/workflows/:workflowId/sections/:sectionId/steps
   * Get all steps for a section
   */
  app.get('/api/workflows/:workflowId/sections/:sectionId/steps', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId, sectionId } = req.params;
      const steps = await stepService.getSteps(workflowId, sectionId, userId);
      res.json(steps);
    } catch (error) {
      logger.error({ error }, "Error fetching steps");
      const message = error instanceof Error ? error.message : "Failed to fetch steps";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/sections/:sectionId/steps/reorder
   * Reorder steps within a section
   */
  app.put('/api/workflows/:workflowId/sections/:sectionId/steps/reorder', hybridAuth, autoRevertToDraft, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId, sectionId } = req.params;
      const { steps } = req.body;

      if (!Array.isArray(steps)) {
        return res.status(400).json({ message: "Invalid steps array" });
      }

      await stepService.reorderSteps(workflowId, sectionId, userId, steps);
      res.status(200).json({ message: "Steps reordered successfully" });
    } catch (error) {
      logger.error({ error }, "Error reordering steps");
      const message = error instanceof Error ? error.message : "Failed to reorder steps";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  // ===================================================================
  // SIMPLIFIED STEP ENDPOINTS (without workflowId in path)
  // These endpoints look up the workflow from the section automatically
  // ===================================================================

  /**
   * GET /api/sections/:sectionId/steps
   * Get all steps for a section (workflow looked up automatically)
   */
  app.get('/api/sections/:sectionId/steps', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { sectionId } = req.params;
      const steps = await stepService.getStepsBySectionId(sectionId, userId);
      res.json(steps);
    } catch (error) {
      logger.error({ error }, "Error fetching steps");
      const message = error instanceof Error ? error.message : "Failed to fetch steps";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * POST /api/sections/:sectionId/steps
   * Create a new step (workflow looked up automatically)
   */
  app.post('/api/sections/:sectionId/steps', hybridAuth, lookupWorkflowIdFromSectionMiddleware, autoRevertToDraft, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { sectionId } = req.params;
      const stepData = req.body;

      const step = await stepService.createStepBySectionId(sectionId, userId, stepData);
      res.status(201).json(step);
    } catch (error) {
      logger.error({ error }, "Error creating step");
      const message = error instanceof Error ? error.message : "Failed to create step";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/sections/:sectionId/steps/reorder
   * Reorder steps (workflow looked up automatically)
   */
  app.put('/api/sections/:sectionId/steps/reorder', hybridAuth, lookupWorkflowIdFromSectionMiddleware, autoRevertToDraft, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { sectionId } = req.params;
      const { steps } = req.body;

      if (!Array.isArray(steps)) {
        return res.status(400).json({ message: "Invalid steps array" });
      }

      await stepService.reorderStepsBySectionId(sectionId, userId, steps);
      res.status(200).json({ message: "Steps reordered successfully" });
    } catch (error) {
      logger.error({ error }, "Error reordering steps");
      const message = error instanceof Error ? error.message : "Failed to reorder steps";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/steps/:stepId
   * Get a single step (workflow looked up automatically)
   */
  app.get('/api/steps/:stepId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { stepId } = req.params;
      const step = await stepService.getStepById(stepId, userId);
      res.json(step);
    } catch (error) {
      logger.error({ error }, "Error fetching step");
      const message = error instanceof Error ? error.message : "Failed to fetch step";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/steps/:stepId
   * Update a step (workflow looked up automatically)
   */
  app.put('/api/steps/:stepId', hybridAuth, lookupWorkflowIdFromStepMiddleware, autoRevertToDraft, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { stepId } = req.params;
      const updateData = req.body;

      const updatedStep = await stepService.updateStepById(stepId, userId, updateData);
      res.json(updatedStep);
    } catch (error) {
      logger.error({ error }, "Error updating step");
      const message = error instanceof Error ? error.message : "Failed to update step";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/steps/:stepId
   * Delete a step (workflow looked up automatically)
   */
  app.delete('/api/steps/:stepId', hybridAuth, lookupWorkflowIdFromStepMiddleware, autoRevertToDraft, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { stepId } = req.params;
      await stepService.deleteStepById(stepId, userId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error deleting step");
      const message = error instanceof Error ? error.message : "Failed to delete step";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });
}
