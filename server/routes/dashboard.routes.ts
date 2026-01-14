import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { WorkflowRepository } from "../repositories/WorkflowRepository";
import { WorkflowRunRepository } from "../repositories/WorkflowRunRepository";

import type { Express, Request, Response } from "express";

const logger = createLogger({ module: 'dashboard-routes' });

/**
 * Register dashboard-related routes
 * Provides overview statistics and metrics for the workflow dashboard
 *
 * NOTE: Refactored from survey-based to workflow-based (Nov 2025)
 */
export function registerDashboardRoutes(app: Express): void {
  const workflowRepository = new WorkflowRepository();
  const workflowRunRepository = new WorkflowRunRepository();

  /**
   * GET /api/dashboard/stats
   * Get dashboard statistics for the authenticated user
   * Returns workflow counts and run statistics
   */
  app.get('/api/dashboard/stats', hybridAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Get user's workflows
      const workflows = await workflowRepository.findByCreatorId(userId);
      const workflowIds = workflows.map((w: any) => w.id);

      // Count workflows by status
      const draftCount = workflows.filter((w: any) => w.status === 'draft').length;
      const activeCount = workflows.filter((w: any) => w.status === 'active').length;
      const archivedCount = workflows.filter((w: any) => w.status === 'archived').length;

      // Get run counts (basic implementation)
      let totalRuns = 0;
      let completedRuns = 0;

      if (workflowIds.length > 0) {
        // Get all runs for user's workflows
        const runs = await workflowRunRepository.findByWorkflowIds(workflowIds);
        totalRuns = runs.length;
        completedRuns = runs.filter((r: any) => r.completed).length;
      }

      const stats = {
        totalWorkflows: workflows.length,
        draftWorkflows: draftCount,
        activeWorkflows: activeCount,
        archivedWorkflows: archivedCount,
        totalRuns,
        completedRuns,
        inProgressRuns: totalRuns - completedRuns
      };

      res.json(stats);
    } catch (error) {
      logger.error({ error }, "Error fetching dashboard stats");
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  /**
   * GET /api/dashboard/workflows
   * Get recent workflows with basic info
   */
  app.get('/api/dashboard/workflows', hybridAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // SECURITY FIX: Validate limit parameter properly (no NaN from parseInt)
      const { numericParamSchema } = await import('../utils/validation');
      const limitSchema = numericParamSchema(1, 100).default(10);
      const limit = req.query.limit ? limitSchema.parse(req.query.limit) : 10;
      const status = req.query.status as string | undefined;

      const workflows = await workflowRepository.findByCreatorId(userId);

      // Filter by status if provided
      let filteredWorkflows = workflows;
      if (status && ['draft', 'active', 'archived'].includes(status)) {
        filteredWorkflows = workflows.filter((w: any) => w.status === status);
      }

      // Sort by most recently updated
      const sortedWorkflows = filteredWorkflows.sort((a: any, b: any) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });

      // Limit results
      const limitedWorkflows = sortedWorkflows.slice(0, limit);

      res.json(limitedWorkflows);
    } catch (error) {
      logger.error({ error }, "Error fetching dashboard workflows");
      res.status(500).json({ message: "Failed to fetch dashboard workflows" });
    }
  });

  /**
   * GET /api/dashboard/recent-runs
   * Get recent workflow runs across all user's workflows
   */
  app.get('/api/dashboard/recent-runs', hybridAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // SECURITY FIX: Validate limit parameter properly (no NaN from parseInt)
      const { numericParamSchema } = await import('../utils/validation');
      const limitSchema = numericParamSchema(1, 100).default(10);
      const limit = req.query.limit ? limitSchema.parse(req.query.limit) : 10;

      // Get user's workflows
      const workflows = await workflowRepository.findByCreatorId(userId);
      const workflowIds = workflows.map((w: any) => w.id);

      if (workflowIds.length === 0) {
        return res.json([]);
      }

      // Get runs for user's workflows
      const runs = await workflowRunRepository.findByWorkflowIds(workflowIds);

      // Sort by most recent first
      const sortedRuns = runs.sort((a: any, b: any) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });

      // Limit results
      const limitedRuns = sortedRuns.slice(0, limit);

      // Enrich runs with workflow titles
      const workflowMap = new Map(workflows.map((w: any) => [w.id, w]));
      const enrichedRuns = limitedRuns.map((run: any) => ({
        ...run,
        workflowTitle: workflowMap.get(run.workflowId)?.title || 'Unknown Workflow'
      }));

      res.json(enrichedRuns);
    } catch (error) {
      logger.error({ error }, "Error fetching recent runs");
      res.status(500).json({ message: "Failed to fetch recent runs" });
    }
  });
}
