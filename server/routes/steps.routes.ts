import type { Express } from "express";
import { isAuthenticated } from "../googleAuth";
import { insertStepSchema } from "@shared/schema";
import { stepService } from "../services/StepService";
import { z } from "zod";

/**
 * Register step-related routes
 * Handles step CRUD operations and reordering
 */
export function registerStepRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/sections/:sectionId/steps
   * Create a new step
   */
  app.post('/api/workflows/:workflowId/sections/:sectionId/steps', isAuthenticated, async (req: any, res) => {
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
      console.error("Error creating step:", error);
      const message = error instanceof Error ? error.message : "Failed to create step";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/workflows/:workflowId/sections/:sectionId/steps
   * Get all steps for a section
   */
  app.get('/api/workflows/:workflowId/sections/:sectionId/steps', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId, sectionId } = req.params;
      const steps = await stepService.getSteps(workflowId, sectionId, userId);
      res.json(steps);
    } catch (error) {
      console.error("Error fetching steps:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch steps";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/steps/:stepId
   * Update a step (needs workflowId in body or query)
   */
  app.put('/api/steps/:stepId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { stepId } = req.params;
      const { workflowId, ...updateData } = req.body;

      if (!workflowId) {
        return res.status(400).json({ message: "workflowId is required in request body" });
      }

      const step = await stepService.updateStep(stepId, workflowId, userId, updateData);
      res.json(step);
    } catch (error) {
      console.error("Error updating step:", error);
      const message = error instanceof Error ? error.message : "Failed to update step";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/steps/:stepId
   * Delete a step (needs workflowId in query)
   */
  app.delete('/api/steps/:stepId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { stepId } = req.params;
      const { workflowId } = req.query;

      if (!workflowId || typeof workflowId !== 'string') {
        return res.status(400).json({ message: "workflowId is required in query parameters" });
      }

      await stepService.deleteStep(stepId, workflowId, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting step:", error);
      const message = error instanceof Error ? error.message : "Failed to delete step";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/workflows/:workflowId/sections/:sectionId/steps/reorder
   * Reorder steps within a section
   */
  app.put('/api/workflows/:workflowId/sections/:sectionId/steps/reorder', isAuthenticated, async (req: any, res) => {
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
      console.error("Error reordering steps:", error);
      const message = error instanceof Error ? error.message : "Failed to reorder steps";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });
}
