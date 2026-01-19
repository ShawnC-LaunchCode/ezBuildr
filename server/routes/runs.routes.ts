import { insertWorkflowRunSchema, insertStepValueSchema } from "@shared/schema";
import { createLogger } from "../logger";
import { hybridAuth, optionalHybridAuth, type AuthRequest } from '../middleware/auth';
import { creatorOrRunTokenAuth, type RunAuthRequest } from "../middleware/runTokenAuth";
import { runService } from "../services/RunService";
import { asyncHandler } from "../utils/asyncHandler";
import type { Express, Request, Response } from "express";
const logger = createLogger({ module: "runs-routes" });
/**
 * Register workflow run-related routes
 * Handles run creation, step value updates, and completion
 */
export function registerRunRoutes(app: Express): void {
  /**
   * POST /api/workflows/public/:publicLinkSlug/start
   * Start an anonymous workflow run from a public link slug
   * No authentication required - creates anonymous run
   * Body: { initialValues?: Record<string, any> } - Optional key/value pairs to pre-populate steps
   */
  app.post('/api/workflows/public/:publicLinkSlug/start', asyncHandler(async (req: Request, res: Response) => {
    try {
      const { publicLinkSlug } = req.params;
      const { initialValues } = req.body;
      // Create anonymous run with optional initial values
      const run = await runService.createRun(publicLinkSlug, undefined, {}, initialValues);
      return res.status(201).json({
        success: true,
        data: {
          runId: run.id,
          runToken: run.runToken,
          workflowId: run.workflowId
        }
      });
    } catch (error) {
      logger.error({ error, slug: req.params.publicLinkSlug }, "Error starting anonymous run");
      const message = error instanceof Error ? error.message : "Failed to start workflow";
      const status = message.includes("not found") ? 404 :
        message.includes("not active") ? 403 :
          message.includes("not public") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }));
  /**
   * POST /api/workflows/:workflowId/runs
   * Create a new workflow run
   * Supports both authenticated (creator) and anonymous (via publicLink) runs
   *
   * For authenticated: POST /api/workflows/:workflowId/runs (with session)
   * For anonymous: POST /api/workflows/:workflowId/runs?publicLink=<slug>
   * Body: {
   *   initialValues?: Record<string, any>,
   *   snapshotId?: string,  // Load values from snapshot
   *   randomize?: boolean,  // Generate random test data via AI
   *   ...runData
   * }
   */
  app.post('/api/workflows/:workflowId/runs', optionalHybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const { publicLink } = req.query;
      const { initialValues, snapshotId, randomize, ...runData } = req.body;
      // Check if this is an anonymous run request
      const isAnonymous = !!publicLink;
      // For authenticated runs, require user ID from AuthRequest (populated by middleware)
      if (!isAnonymous) {
        const authReq = req as AuthRequest;
        const userId = authReq.userId;
        if (!userId) {
          return res.status(401).json({
            success: false,
            error: "Unauthorized - authentication required for creator runs"
          });
        }
        const run = await runService.createRun(
          workflowId,
          userId,
          runData,
          initialValues,
          { snapshotId, randomize }
        );
        return res.status(201).json({
          success: true,
          data: {
            runId: run.id,
            runToken: run.runToken,
            currentSectionId: run.currentSectionId
          }
        });
      }
      // Anonymous run
      const run = await runService.createRun(
        workflowId,
        undefined,
        runData,
        initialValues,
        { snapshotId, randomize }
      );
      return res.status(201).json({
        success: true,
        data: {
          runId: run.id,
          runToken: run.runToken,
          currentSectionId: run.currentSectionId
        }
      });
    } catch (error) {
      // Log error with full details
      if (error instanceof Error) {
        logger.error({
          message: error.message,
          stack: error.stack,
          name: error.name,
          workflowId: req.params.workflowId
        }, "Error creating run");
      } else {
        logger.error({
          error: String(error),
          workflowId: req.params.workflowId
        }, "Error creating run (non-Error object)");
      }
      const message = error instanceof Error ? error.message : "Failed to create run";
      const status = message.includes("not found") ? 404 :
        message.includes("Access denied") ? 403 :
          message.includes("not active") ? 403 :
            message.includes("not configured") ? 503 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }));
  /**
   * GET /api/runs/:runId
   * Get a workflow run
   * Accepts creator session OR Bearer runToken
   */
  app.get('/api/runs/:runId', creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
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
  }));
  /**
   * GET /api/runs/:runId/values
   * Get a workflow run with all step values
   * Accepts creator session OR Bearer runToken
   */
  app.get('/api/runs/:runId/values', creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const runAuthReq = req as RunAuthRequest;
      const userId = (req as AuthRequest).userId;
      const runAuth = runAuthReq.runAuth;
      // For run token auth, verify the runId matches
      if (runAuth) {
        if (runAuth.runId !== runId) {
          return res.status(403).json({ success: false, error: "Access denied - run mismatch" });
        }
        // Fetch run without userId check
        const run = await runService.getRunWithValuesNoAuth(runId);
        return res.json({ success: true, data: run });
      }
      // For session/token auth, we need userId
      if (!userId) {
        logger.warn({
          hasUser: !!userId,
          path: req.path
        }, "No userId found for auth");
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID found" });
      }
      const run = await runService.getRunWithValues(runId, userId);
      res.json({ success: true, data: run });
    } catch (error) {
      logger.error({
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        runId: req.params.runId,
        hasUser: !!(req as any).user,
        hasRunAuth: !!(req as RunAuthRequest).runAuth,
        userId: (req as AuthRequest).userId
      }, "Error fetching run with values");
      const message = error instanceof Error ? error.message : "Failed to fetch run";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }));
  /**
   * POST /api/runs/:runId/values
   * Upsert a single step value
   * Accepts creator session OR Bearer runToken
   */
  app.post('/api/runs/:runId/values', creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const { stepId, value } = req.body;
      const userId = (req as AuthRequest).userId;
      const runAuth = (req as RunAuthRequest).runAuth;
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
  }));
  /**
   * POST /api/runs/:runId/sections/:sectionId/submit
   * Submit section values with validation
   * Executes onSectionSubmit blocks (transform + validate)
   * Accepts creator session OR Bearer runToken
   */
  app.post('/api/runs/:runId/sections/:sectionId/submit', creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { runId, sectionId } = req.params;
      const { values } = req.body;
      const userId = (req as AuthRequest).userId;
      const runAuth = (req as RunAuthRequest).runAuth;
      logger.info({
        runId,
        sectionId,
        valuesType: typeof values,
        isArray: Array.isArray(values),
        valuesLength: Array.isArray(values) ? values.length : 0,
        bodyKeys: Object.keys(req.body)
      }, "Section submit request received");
      if (!Array.isArray(values)) {
        logger.warn({ runId, sectionId, values }, "values is not an array");
        return res.status(400).json({ success: false, errors: ["values must be an array"] });
      }
      // For run token auth
      if (runAuth) {
        if (runAuth.runId !== runId) {
          return res.status(403).json({ success: false, errors: ["Access denied - run mismatch"] });
        }
        const result = await runService.submitSectionNoAuth(runId, sectionId, values);
        // Return 200 for both success and validation errors
        // (400 would cause fetch to throw, losing the error details)
        return res.json(result);
      }
      // For session auth
      if (!userId) {
        return res.status(401).json({ success: false, errors: ["Unauthorized - no user ID"] });
      }
      // Submit section with validation
      const result = await runService.submitSection(runId, sectionId, userId, values);
      if (result.success) {
        logger.info({ runId, sectionId }, "Section submitted successfully");
        res.json({ success: true, message: "Section values saved" });
      } else {
        // Validation failed - return 200 with success: false and error messages
        // (400 would cause fetch to throw, losing the error details)
        logger.warn({ runId, sectionId, errors: result.errors }, "Section validation failed");
        res.json({ success: false, errors: result.errors });
      }
    } catch (error) {
      const { runId, sectionId } = req.params;
      logger.error({
        error,
        runId,
        sectionId,
      }, "Error submitting section values");
      const message = error instanceof Error ? error.message : "Failed to submit section values";
      const status = message.includes("not found") ? 404 :
        message.includes("Access denied") ? 403 :
          message.includes("already completed") ? 400 : 500;
      res.status(status).json({ success: false, errors: [message] });
    }
  }));
  /**
   * POST /api/runs/:runId/next
   * Navigate to next section (executes branch blocks)
   * Accepts creator session OR Bearer runToken
   */
  app.post('/api/runs/:runId/next', creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const userId = (req as AuthRequest).userId;
      const runAuth = (req as RunAuthRequest).runAuth;
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
  }));
  /**
   * POST /api/runs/:runId/values/bulk
   * Bulk upsert step values
   * Accepts creator session OR Bearer runToken
   */
  app.post('/api/runs/:runId/values/bulk', creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const { values } = req.body;
      const userId = (req as AuthRequest).userId;
      const runAuth = (req as RunAuthRequest).runAuth;
      if (!Array.isArray(values)) {
        return res.status(400).json({ success: false, error: "values must be an array" });
      }
      // For run token auth
      if (runAuth) {
        if (runAuth.runId !== runId) {
          return res.status(403).json({ success: false, error: "Access denied - run mismatch" });
        }
        // Bulk upsert without userId check (run token auth)
        await runService.bulkUpsertValuesNoAuth(runId, values);
        return res.status(200).json({ success: true, message: "Step values saved" });
      }
      // For session auth
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }
      await runService.bulkUpsertValues(runId, userId, values);
      res.status(200).json({ success: true, message: "Step values saved" });
    } catch (error) {
      logger.error({ error }, "Error saving step values");
      const message = error instanceof Error ? error.message : "Failed to save step values";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }));
  // NOTE: Duplicate route removed - /api/runs/:runId/next is already defined above with creatorOrRunTokenAuth
  /**
   * PUT /api/runs/:runId/complete
   * Mark a run as complete (with validation)
   * Accepts creator session OR Bearer runToken
   */
  app.put('/api/runs/:runId/complete', creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const userId = (req as AuthRequest).userId;
      const runAuth = (req as RunAuthRequest).runAuth;
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
  }));
  /**
   * GET /api/workflows/:workflowId/runs
   * List all runs for a workflow
   */
  app.get('/api/workflows/:workflowId/runs', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
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
  }));
  /**
   * GET /api/runs/:runId/documents
   * Get generated documents for a workflow run
   * Accepts creator session OR Bearer runToken
   */
  app.get('/api/runs/:runId/documents', creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      // Validate runId
      if (!runId || runId === 'null' || runId === 'undefined') {
        return res.status(400).json({
          success: false,
          error: "Invalid run ID - runId cannot be null or undefined"
        });
      }
      const userId = (req as AuthRequest).userId;
      const runAuth = (req as RunAuthRequest).runAuth;
      // For run token auth, verify the runId matches
      if (runAuth) {
        if (runAuth.runId !== runId) {
          return res.status(403).json({ success: false, error: "Access denied - run mismatch" });
        }
        // Fetch documents without userId check
        const documents = await runService.getGeneratedDocuments(runId);
        return res.json({ success: true, documents });
      }
      // For session auth, we need userId
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }
      const documents = await runService.getGeneratedDocuments(runId);
      res.json({ success: true, documents });
    } catch (error) {
      logger.error({ error, runId: req.params.runId }, "Error fetching generated documents");
      const message = error instanceof Error ? error.message : "Failed to fetch documents";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }));
  /**
   * POST /api/runs/:runId/generate-documents
   * Trigger document generation for a workflow run
   * Can be called before run completion (for Final Documents sections)
   * Idempotent - won't regenerate if documents already exist
   * Accepts creator session OR Bearer runToken
   */
  app.post('/api/runs/:runId/generate-documents', creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      // Validate runId
      if (!runId || runId === 'null' || runId === 'undefined') {
        return res.status(400).json({
          success: false,
          error: "Invalid run ID - runId cannot be null or undefined"
        });
      }
      const runAuth = (req as RunAuthRequest).runAuth;
      // For run token auth, verify the runId matches
      if (runAuth && runAuth.runId !== runId) {
        return res.status(403).json({ success: false, error: "Access denied - run mismatch" });
      }
      // Trigger document generation
      await runService.generateDocuments(runId);
      return res.json({ success: true, message: "Documents generation triggered" });
    } catch (error) {
      logger.error({ error, runId: req.params.runId }, "Error generating documents");
      const message = error instanceof Error ? error.message : "Failed to generate documents";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }));
  /**
   * DELETE /api/runs/:runId/documents
   * Delete all generated documents for a run (for regeneration)
   * Accepts creator session OR Bearer runToken
   */
  app.delete('/api/runs/:runId/documents', creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      // Validate runId
      if (!runId || runId === 'null' || runId === 'undefined') {
        return res.status(400).json({
          success: false,
          error: "Invalid run ID - runId cannot be null or undefined"
        });
      }
      const runAuth = (req as RunAuthRequest).runAuth;
      // For run token auth, verify the runId matches
      if (runAuth && runAuth.runId !== runId) {
        return res.status(403).json({ success: false, error: "Access denied - run mismatch" });
      }
      // Delete all documents for this run
      await runService.deleteGeneratedDocuments(runId);
      return res.json({ success: true, message: "Documents deleted successfully" });
    } catch (error) {
      logger.error({ error, runId: req.params.runId }, "Error deleting documents");
      const message = error instanceof Error ? error.message : "Failed to delete documents";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }));
  /**
   * POST /api/runs/:runId/share
   * Generate a shareable link for a run
   * Accepts creator session OR Bearer runToken
   */
  app.post('/api/runs/:runId/share', creatorOrRunTokenAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { runId } = req.params;
      const userId = (req as AuthRequest).userId;
      const runAuth = (req as RunAuthRequest).runAuth;
      // Determine auth type
      const authType = runAuth ? 'runToken' : 'creator';
      const authContext = runAuth ? { runToken: runAuth.runToken } : {};
      const result = await runService.shareRun(runId, userId, authType, authContext);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ error, runId: req.params.runId }, "Error sharing run");
      const message = error instanceof Error ? error.message : "Failed to share run";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  }));
  /**
   * GET /api/shared/runs/:token
   * Get a shared run by token with documents and configuration
   */
  app.get('/api/shared/runs/:token', asyncHandler(async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const result = await runService.getSharedRunDetails(token);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error({ error, token: req.params.token }, "Error fetching shared run");
      const message = error instanceof Error ? error.message : "Failed to fetch shared run";
      const status = message.includes("not found") ? 404 : 400; // 400 for expired
      res.status(status).json({ success: false, error: message });
    }
  }));
}