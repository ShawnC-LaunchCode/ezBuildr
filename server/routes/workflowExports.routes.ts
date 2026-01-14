import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { workflowExportService } from "../services/WorkflowExportService";

import type { Express, Request, Response } from "express";

const logger = createLogger({ module: "workflow-exports-routes" });

/**
 * Register workflow export routes
 * Handles JSON and CSV exports
 */
export function registerWorkflowExportRoutes(app: Express): void {
  /**
   * GET /api/workflows/:workflowId/export?format=json|csv
   * Export workflow runs as JSON or CSV
   */
  app.get('/api/workflows/:workflowId/export', hybridAuth, async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { workflowId } = req.params;
      const { format = 'json' } = req.query;

      if (format === 'csv') {
        const csv = await workflowExportService.exportCSV(workflowId, userId);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="workflow-${workflowId}-export.csv"`);
        res.send(csv);
      } else if (format === 'json') {
        const json = await workflowExportService.exportJSON(workflowId, userId);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="workflow-${workflowId}-export.json"`);
        res.json(json);
      } else {
        res.status(400).json({ message: "Invalid format. Use 'json' or 'csv'" });
      }
    } catch (error) {
      logger.error({ error }, "Error exporting workflow");
      const message = error instanceof Error ? error.message : "Failed to export workflow";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });
}
