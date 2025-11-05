import type { Express } from "express";
import { isAuthenticated } from "../googleAuth";
import { insertWorkflowRunSchema, insertStepValueSchema } from "@shared/schema";
import { runService } from "../services/RunService";
import { z } from "zod";

/**
 * Register workflow run-related routes
 * Handles run creation, step value updates, and completion
 */
export function registerRunRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/runs
   * Create a new workflow run
   */
  app.post('/api/workflows/:workflowId/runs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const runData = req.body;

      const run = await runService.createRun(workflowId, userId, runData);
      res.status(201).json(run);
    } catch (error) {
      console.error("Error creating run:", error);
      const message = error instanceof Error ? error.message : "Failed to create run";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/runs/:runId
   * Get a workflow run
   */
  app.get('/api/runs/:runId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { runId } = req.params;
      const run = await runService.getRun(runId, userId);
      res.json(run);
    } catch (error) {
      console.error("Error fetching run:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch run";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/runs/:runId/values
   * Get a workflow run with all step values
   */
  app.get('/api/runs/:runId/values', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { runId } = req.params;
      const run = await runService.getRunWithValues(runId, userId);
      res.json(run);
    } catch (error) {
      console.error("Error fetching run with values:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch run";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * POST /api/runs/:runId/values
   * Upsert a single step value
   */
  app.post('/api/runs/:runId/values', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { runId } = req.params;
      const { stepId, value } = req.body;

      if (!stepId) {
        return res.status(400).json({ message: "stepId is required" });
      }

      await runService.upsertStepValue(runId, userId, {
        runId,
        stepId,
        value,
      });

      res.status(200).json({ message: "Step value saved" });
    } catch (error) {
      console.error("Error saving step value:", error);
      const message = error instanceof Error ? error.message : "Failed to save step value";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * POST /api/runs/:runId/values/bulk
   * Bulk upsert step values
   */
  app.post('/api/runs/:runId/values/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { runId } = req.params;
      const { values } = req.body;

      if (!Array.isArray(values)) {
        return res.status(400).json({ message: "values must be an array" });
      }

      await runService.bulkUpsertValues(runId, userId, values);
      res.status(200).json({ message: "Step values saved" });
    } catch (error) {
      console.error("Error saving step values:", error);
      const message = error instanceof Error ? error.message : "Failed to save step values";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PUT /api/runs/:runId/complete
   * Mark a run as complete (with validation)
   */
  app.put('/api/runs/:runId/complete', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { runId } = req.params;
      const run = await runService.completeRun(runId, userId);
      res.json(run);
    } catch (error) {
      console.error("Error completing run:", error);
      const message = error instanceof Error ? error.message : "Failed to complete run";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : message.includes("Missing required") ? 400 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/workflows/:workflowId/runs
   * List all runs for a workflow
   */
  app.get('/api/workflows/:workflowId/runs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const runs = await runService.listRuns(workflowId, userId);
      res.json(runs);
    } catch (error) {
      console.error("Error listing runs:", error);
      const message = error instanceof Error ? error.message : "Failed to list runs";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });
}
