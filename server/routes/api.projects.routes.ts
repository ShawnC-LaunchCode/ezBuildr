import projectsRouter from "../api/projects";

import type { Express } from "express";

/**
 * Register Stage 4 Projects API routes
 */
export function registerApiProjectRoutes(app: Express): void {
  app.use('/api/projects', projectsRouter);
}
