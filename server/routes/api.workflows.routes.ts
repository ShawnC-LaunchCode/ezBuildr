import workflowsRouter from "../api/workflows";

import type { Express } from "express";

/**
 * Register Stage 4 Workflows API routes
 */
export function registerApiWorkflowRoutes(app: Express): void {
  app.use('/api', workflowsRouter);
}
