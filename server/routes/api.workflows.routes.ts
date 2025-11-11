import type { Express } from "express";
import workflowsRouter from "../api/workflows";

/**
 * Register Stage 4 Workflows API routes
 */
export function registerApiWorkflowRoutes(app: Express): void {
  app.use('/api', workflowsRouter);
}
