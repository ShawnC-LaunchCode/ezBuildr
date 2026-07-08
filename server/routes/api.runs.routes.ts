import runsRouter from "../api/runs";

import type { Express } from "express";

/**
 * Register Stage 4 Runs API routes
 */
export function registerApiRunRoutes(app: Express): void {
  app.use('/api', runsRouter);
}
