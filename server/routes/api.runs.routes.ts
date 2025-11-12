import type { Express } from "express";
import runsRouter from "../api/runs";

/**
 * Register Stage 4 Runs API routes
 */
export function registerApiRunRoutes(app: Express): void {
  app.use('/api', runsRouter);
}
