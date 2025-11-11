import type { Express } from "express";
import projectsRouter from "../api/projects";

/**
 * Register Stage 4 Projects API routes
 */
export function registerApiProjectRoutes(app: Express): void {
  app.use('/api', projectsRouter);
}
