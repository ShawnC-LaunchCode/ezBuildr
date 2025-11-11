import type { Express } from "express";
import templatesRouter from "../api/templates";

/**
 * Register Stage 4 Templates API routes
 */
export function registerApiTemplateRoutes(app: Express): void {
  app.use('/api', templatesRouter);
}
