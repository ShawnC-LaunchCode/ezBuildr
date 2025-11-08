import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../googleAuth";
import { insertStepSchema } from "@shared/schema";
import { stepService } from "../services/StepService";
import { z } from "zod";
import { createLogger } from "../logger";

const logger = createLogger({ module: "steps-routes" });

/**
 * Register step-related routes
 * Handles step CRUD operations and reordering
 */
export function registerStepRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/sections/:sectionId/steps
   * Create a new step
   */
  app.post('/api/workflows/:workflowId/sections/:sectionId/steps', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
  app.get('/api/workflows/:workflowId/sections/:sectionId/steps', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
  app.put('/api/workflows/:workflowId/sections/:sectionId/steps/reorder', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
  app.get('/api/sections/:sectionId/steps', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { sectionId } = req.params;

      // Look up the section to get its workflowId
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
  app.post('/api/sections/:sectionId/steps', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
  app.put('/api/sections/:sectionId/steps/reorder', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
  app.get('/api/steps/:stepId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
  app.put('/api/steps/:stepId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { stepId } = req.params;
      const updateData = req.body;

      const step = await stepService.updateStepById(stepId, userId, updateData);
      res.json(step);
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
  app.delete('/api/steps/:stepId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
