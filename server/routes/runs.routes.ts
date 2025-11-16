import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../googleAuth";
import { insertWorkflowRunSchema, insertStepValueSchema } from "@shared/schema";
import { runService } from "../services/RunService";
import { creatorOrRunTokenAuth, type RunAuthRequest } from "../middleware/runTokenAuth";
import { z } from "zod";
import { createLogger } from "../logger";

const logger = createLogger({ module: "runs-routes" });

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
        // Check for user in both possible locations
        const user = req.user || (req.session as any)?.user;
        if (!user) {
          return res.status(401).json({
            success: false,
            error: "Unauthorized - authentication required for creator runs"
          });
        }
        const userId = user?.claims?.sub;
        if (!userId) {
          return res.status(401).json({
            success: false,
            error: "Unauthorized - no user ID"
          });
        }

        const run = await runService.createRun(workflowId, userId, runData);

        return res.status(201).json({
          success: true,
          data: {
            runId: run.id,
            runToken: run.runToken
          }
        });
      }

      // Anonymous run - no authentication required
      // For anonymous runs, we'd need to pass empty userId, but RunService expects string
      // This needs to be refactored to support anonymous runs properly
      return res.status(400).json({
        success: false,
        error: "Anonymous runs via publicLink not yet supported - service needs refactoring"
      });
    } catch (error) {
      logger.error({ error }, "Error creating run");
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
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const run = await runService.getRun(runId, userId);
      res.json({ success: true, data: run });
    } catch (error) {
      logger.error({ error }, "Error fetching run");
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
      const userId = req.user?.claims?.sub;
      const runAuth = req.runAuth;

      // For run token auth, verify the runId matches
      if (runAuth) {
        if (runAuth.runId !== runId) {
          return res.status(403).json({ success: false, error: "Access denied - run mismatch" });
        }
        // Fetch run without userId check
        const run = await runService.getRunWithValuesNoAuth(runId);
        return res.json({ success: true, data: run });
      }

      // For session auth, we need userId
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const run = await runService.getRunWithValues(runId, userId);
      res.json({ success: true, data: run });
    } catch (error) {
      logger.error({ error }, "Error fetching run with values");
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
      const userId = req.user?.claims?.sub;
      const runAuth = req.runAuth;

      if (!stepId) {
        return res.status(400).json({ success: false, error: "stepId is required" });
      }

      // For run token auth
      if (runAuth) {
        if (runAuth.runId !== runId) {
          return res.status(403).json({ success: false, error: "Access denied - run mismatch" });
        }
        await runService.upsertStepValueNoAuth(runId, { runId, stepId, value });
        return res.status(200).json({ success: true, message: "Step value saved" });
      }

      // For session auth
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      await runService.upsertStepValue(runId, userId, {
        runId,
        stepId,
        value,
      });

      res.status(200).json({ success: true, message: "Step value saved" });
    } catch (error) {
      logger.error({ error }, "Error saving step value");
      const message = error instanceof Error ? error.message : "Failed to save step value";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * POST /api/runs/:runId/sections/:sectionId/submit
   * Submit section values with validation
   * Executes onSectionSubmit blocks (transform + validate)
   * Accepts creator session OR Bearer runToken
   */
  app.post('/api/runs/:runId/sections/:sectionId/submit', creatorOrRunTokenAuth, async (req: RunAuthRequest, res) => {
    try {
      const { runId, sectionId } = req.params;
      const { values } = req.body;
      const userId = req.user?.claims?.sub;
      const runAuth = req.runAuth;

      if (!Array.isArray(values)) {
        return res.status(400).json({ success: false, errors: ["values must be an array"] });
      }

      // For run token auth
      if (runAuth) {
        if (runAuth.runId !== runId) {
          return res.status(403).json({ success: false, errors: ["Access denied - run mismatch"] });
        }
        const result = await runService.submitSectionNoAuth(runId, sectionId, values);
        if (result.success) {
          return res.json({ success: true, message: "Section values saved" });
        } else {
          return res.status(400).json({ success: false, errors: result.errors });
        }
      }

      // For session auth
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }

      // Submit section with validation
      const result = await runService.submitSection(runId, sectionId, userId, values);

      if (result.success) {
        res.json({ success: true, message: "Section values saved" });
      } else {
        // Validation failed - return 400 with error messages
        res.status(400).json({ success: false, errors: result.errors });
      }
    } catch (error) {
      logger.error({ error }, "Error submitting section values");
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
      const userId = req.user?.claims?.sub;
      const runAuth = req.runAuth;

      // For run token auth
      if (runAuth) {
        if (runAuth.runId !== runId) {
          return res.status(403).json({ success: false, errors: ["Access denied - run mismatch"] });
        }
        const result = await runService.nextNoAuth(runId);
        return res.json({ success: true, data: result });
      }

      // For session auth
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }

      // Use the 'next' method from runService
      const result = await runService.next(runId, userId);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ error }, "Error navigating to next section");
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
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      if (!Array.isArray(values)) {
        return res.status(400).json({ success: false, error: "values must be an array" });
      }

      await runService.bulkUpsertValues(runId, userId, values);
      res.status(200).json({ success: true, message: "Step values saved" });
    } catch (error) {
      logger.error({ error }, "Error saving step values");
      const message = error instanceof Error ? error.message : "Failed to save step values";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  // NOTE: Duplicate route removed - /api/runs/:runId/next is already defined above with creatorOrRunTokenAuth

  /**
   * PUT /api/runs/:runId/complete
   * Mark a run as complete (with validation)
   * Accepts creator session OR Bearer runToken
   */
  app.put('/api/runs/:runId/complete', creatorOrRunTokenAuth, async (req: RunAuthRequest, res) => {
    try {
      const { runId } = req.params;
      const userId = req.user?.claims?.sub;
      const runAuth = req.runAuth;

      // For run token auth
      if (runAuth) {
        if (runAuth.runId !== runId) {
          return res.status(403).json({ success: false, error: "Access denied - run mismatch" });
        }
        const run = await runService.completeRunNoAuth(runId);
        return res.json({ success: true, data: run });
      }

      // For session auth
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const run = await runService.completeRun(runId, userId);
      res.json({ success: true, data: run });
    } catch (error) {
      logger.error({ error }, "Error completing run");
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
      logger.error({ error }, "Error listing runs");
      const message = error instanceof Error ? error.message : "Failed to list runs";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });
}
