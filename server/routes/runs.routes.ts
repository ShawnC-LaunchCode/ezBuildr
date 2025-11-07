import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../googleAuth";
import { insertWorkflowRunSchema, insertStepValueSchema } from "@shared/schema";
import { runService } from "../services/RunService";
import { creatorOrRunTokenAuth, type RunAuthRequest } from "../middleware/runTokenAuth";
import { z } from "zod";

/**
 * Register workflow run-related routes
 * Handles run creation, step value updates, and completion
 */
export function registerRunRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/runs
   * Create a new workflow run
   * Supports both authenticated (creator) and anonymous (via publicLink) runs
   *
   * For authenticated: POST /api/workflows/:workflowId/runs (with session)
   * For anonymous: POST /api/workflows/:workflowId/runs?publicLink=<slug>
   */
  app.post('/api/workflows/:workflowId/runs', async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const { publicLink } = req.query;
      const runData = req.body;

      // Check if this is an anonymous run request
      const isAnonymous = !!publicLink;

      // For authenticated runs, require session
      if (!isAnonymous) {
        if (!req.isAuthenticated || !req.isAuthenticated()) {
          return res.status(401).json({
            success: false,
            error: "Unauthorized - authentication required for creator runs"
          });
        }
        const userId = req.user?.claims?.sub;
        if (!userId) {
          return res.status(401).json({
            success: false,
            error: "Unauthorized - no user ID"
          });
        }

        const run = await runService.createRun(workflowId, userId, runData, req.query, false);
        return res.status(201).json({
          success: true,
          data: {
            runId: run.id,
            runToken: run.runToken
          }
        });
      }

      // Anonymous run - no authentication required
      const run = await runService.createRun(workflowId, null, runData, req.query, true);
      res.status(201).json({
        success: true,
        data: {
          runId: run.id,
          runToken: run.runToken
        }
      });
    } catch (error) {
      logger.error("Error creating run:", error);
      const message = error instanceof Error ? error.message : "Failed to create run";
      const status = message.includes("not found") ? 404 :
                     message.includes("Access denied") ? 403 :
                     message.includes("not active") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/runs/:runId
   * Get a workflow run
   * Accepts creator session OR Bearer runToken
   */
  app.get('/api/runs/:runId', creatorOrRunTokenAuth, async (req: RunAuthRequest, res) => {
    try {
      const { runId } = req.params;
      const userId = req.user?.claims?.sub || null;
      const runToken = req.runAuth?.runToken;

      const run = await runService.getRun(runId, userId, runToken);
      res.json({ success: true, data: run });
    } catch (error) {
      logger.error("Error fetching run:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch run";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/runs/:runId/values
   * Get a workflow run with all step values
   * Accepts creator session OR Bearer runToken
   */
  app.get('/api/runs/:runId/values', creatorOrRunTokenAuth, async (req: RunAuthRequest, res) => {
    try {
      const { runId } = req.params;
      const userId = req.user?.claims?.sub || null;
      const runToken = req.runAuth?.runToken;

      const run = await runService.getRunWithValues(runId, userId, runToken);
      res.json({ success: true, data: run });
    } catch (error) {
      logger.error("Error fetching run with values:", error);
      const message = error instanceof Error ? error.message : "Failed to fetch run";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/runs/:runId/values
   * Upsert a single step value
   * Accepts creator session OR Bearer runToken
   */
  app.post('/api/runs/:runId/values', creatorOrRunTokenAuth, async (req: RunAuthRequest, res) => {
    try {
      const { runId } = req.params;
      const { stepId, value } = req.body;
      const userId = req.user?.claims?.sub || null;
      const runToken = req.runAuth?.runToken;

      if (!stepId) {
        return res.status(400).json({ success: false, error: "stepId is required" });
      }

      await runService.upsertStepValue(runId, userId, {
        runId,
        stepId,
        value,
      }, runToken);

      res.status(200).json({ success: true, message: "Step value saved" });
    } catch (error) {
      logger.error("Error saving step value:", error);
      const message = error instanceof Error ? error.message : "Failed to save step value";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/runs/:runId/sections/:sectionId/submit
   * Submit section values with validation
   * Accepts creator session OR Bearer runToken
   */
  app.post('/api/runs/:runId/sections/:sectionId/submit', creatorOrRunTokenAuth, async (req: RunAuthRequest, res) => {
    try {
      const { runId, sectionId } = req.params;
      const { values } = req.body;
      const userId = req.user?.claims?.sub || null;
      const runToken = req.runAuth?.runToken;

      if (!Array.isArray(values)) {
        return res.status(400).json({ success: false, errors: ["values must be an array"] });
      }

      const result = await runService.submitSectionValues(runId, userId, sectionId, values, runToken);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error("Error submitting section values:", error);
      const message = error instanceof Error ? error.message : "Failed to submit section values";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });

  /**
   * POST /api/runs/:runId/next
   * Navigate to next section (executes branch blocks)
   * Accepts creator session OR Bearer runToken
   */
  app.post('/api/runs/:runId/next', creatorOrRunTokenAuth, async (req: RunAuthRequest, res) => {
    try {
      const { runId } = req.params;
      const { currentSectionId } = req.body;
      const userId = req.user?.claims?.sub || null;
      const runToken = req.runAuth?.runToken;

      if (!currentSectionId) {
        return res.status(400).json({ success: false, errors: ["currentSectionId is required"] });
      }

      const result = await runService.navigateNext(runId, userId, currentSectionId, runToken);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error("Error navigating to next section:", error);
      const message = error instanceof Error ? error.message : "Failed to navigate to next section";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  });

  /**
   * POST /api/runs/:runId/values/bulk
   * Bulk upsert step values
   * Accepts creator session OR Bearer runToken
   */
  app.post('/api/runs/:runId/values/bulk', creatorOrRunTokenAuth, async (req: RunAuthRequest, res) => {
    try {
      const { runId } = req.params;
      const { values } = req.body;
      const userId = req.user?.claims?.sub || null;
      const runToken = req.runAuth?.runToken;

      if (!Array.isArray(values)) {
        return res.status(400).json({ success: false, error: "values must be an array" });
      }

      await runService.bulkUpsertValues(runId, userId, values, runToken);
      res.status(200).json({ success: true, message: "Step values saved" });
    } catch (error) {
      logger.error("Error saving step values:", error);
      const message = error instanceof Error ? error.message : "Failed to save step values";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/runs/:runId/next
   * Calculate and navigate to the next section in the workflow
   * Updates run state (currentSectionId, progress) and returns navigation info
   */
  app.post('/api/runs/:runId/next', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { runId } = req.params;
      const navigation = await runService.next(runId, userId);

      res.json({
        success: true,
        data: navigation,
      });
    } catch (error) {
      logger.error("Error calculating next section:", error);
      const message = error instanceof Error ? error.message : "Failed to calculate next section";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : message.includes("already completed") ? 400 : 500;
      res.status(status).json({
        success: false,
        error: message
      });
    }
  });

  /**
   * PUT /api/runs/:runId/complete
   * Mark a run as complete (with validation)
   * Accepts creator session OR Bearer runToken
   */
  app.put('/api/runs/:runId/complete', creatorOrRunTokenAuth, async (req: RunAuthRequest, res) => {
    try {
      const { runId } = req.params;
      const userId = req.user?.claims?.sub || null;
      const runToken = req.runAuth?.runToken;

      const run = await runService.completeRun(runId, userId, runToken);
      res.json({ success: true, data: run });
    } catch (error) {
      logger.error("Error completing run:", error);
      const message = error instanceof Error ? error.message : "Failed to complete run";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : message.includes("Missing required") ? 400 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * GET /api/workflows/:workflowId/runs
   * List all runs for a workflow
   */
  app.get('/api/workflows/:workflowId/runs', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const runs = await runService.listRuns(workflowId, userId);
      res.json(runs);
    } catch (error) {
      logger.error("Error listing runs:", error);
      const message = error instanceof Error ? error.message : "Failed to list runs";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });
}
