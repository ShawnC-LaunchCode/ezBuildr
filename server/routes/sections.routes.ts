import { insertSectionSchema } from "@shared/schema";
import type { InsertSection } from "@shared/schema";

import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { autoRevertToDraft } from "../middleware/autoRevertToDraft";
import { createLimiter } from "../middleware/rateLimiting";
import { sectionRepository } from "../repositories/SectionRepository";
import { sectionService } from "../services/SectionService";
import { asyncHandler } from "../utils/asyncHandler";
import { classifyRouteError } from "../utils/routeErrors";

import type { Express, Request, Response, NextFunction } from "express";

const logger = createLogger({ module: "sections-routes" });

const UNAUTHORIZED_MSG = "Unauthorized - no user ID";
/**
 * Middleware helper: Look up workflowId from sectionId before auto-revert
 * This allows auto-revert to work on simplified endpoints (without workflowId in path)
 */
async function lookupWorkflowIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { sectionId } = req.params;
    if (!sectionId) {
      return next();
    }
    const section = await sectionRepository.findById(sectionId);
    if (!section) {
      res.status(404).json({ message: "Section not found" });
      return;
    }
    // eslint-disable-next-line no-param-reassign -- Express middleware convention: augment req.params for downstream handlers
    req.params.workflowId = section.workflowId;
    next();
  } catch (error) {
    logger.error({ error }, "Error in lookupWorkflowIdMiddleware");
    next(error);
  }
}

/**
 * Register section-related routes
 * Handles section CRUD operations and reordering
 */
// eslint-disable-next-line max-lines-per-function -- route registration function
export function registerSectionRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/sections
   * Create a new section
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.post('/api/workflows/:workflowId/sections', hybridAuth, createLimiter, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId } = req.params;
      const sectionData = insertSectionSchema.partial().parse(req.body) as Omit<InsertSection, 'workflowId'>;
      const section = await sectionService.createSection(workflowId, userId, sectionData);
      res.status(201).json(section);
    } catch (error) {
      logger.error({ error }, "Error creating section");
      const { status, message } = classifyRouteError(error, "Failed to create section");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/sections
   * Get all sections for a workflow
   */
  app.get('/api/workflows/:workflowId/sections', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId } = req.params;
      const sections = await sectionService.getSections(workflowId, userId);
      res.json(sections);
    } catch (error) {
      logger.error({ error }, "Error fetching sections");
      const { status, message } = classifyRouteError(error, "Failed to fetch sections");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/sections/:sectionId
   * Get a single section with steps
   */
  app.get('/api/workflows/:workflowId/sections/:sectionId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId, sectionId } = req.params;
      const section = await sectionService.getSectionWithSteps(sectionId, workflowId, userId);
      res.json(section);
    } catch (error) {
      logger.error({ error }, "Error fetching section");
      const { status, message } = classifyRouteError(error, "Failed to fetch section");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/sections/reorder
   * Reorder sections
   * NOTE: This route MUST come before /:sectionId routes to avoid "reorder" being treated as an ID
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.put('/api/workflows/:workflowId/sections/reorder', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId } = req.params;
      const { sections } = req.body as { sections: unknown };
      if (!Array.isArray(sections)) {
        return res.status(400).json({ message: "Invalid sections array" });
      }
      logger.info({ sections, workflowId }, "Reordering sections");
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const typedSections = sections as Array<{ id: string; order: number }>;
      for (const section of typedSections) {
        if (!section.id || !uuidRegex.test(section.id)) {
          logger.error({ invalidSection: section }, "Invalid section ID format");
          return res.status(400).json({
            message: `Invalid section ID format: ${section.id}`,
            details: "Section ID must be a valid UUID"
          });
        }
      }
      await sectionService.reorderSections(workflowId, userId, typedSections);
      res.status(200).json({ message: "Sections reordered successfully" });
    } catch (error) {
      logger.error({ error }, "Error reordering sections");
      const { status, message } = classifyRouteError(error, "Failed to reorder sections");
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/sections/:sectionId
   * Update a section
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.put('/api/workflows/:workflowId/sections/:sectionId', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId, sectionId } = req.params;
      const updateData = insertSectionSchema.partial().parse(req.body);
      const section = await sectionService.updateSection(sectionId, workflowId, userId, updateData);
      res.json(section);
    } catch (error) {
      logger.error({ error }, "Error updating section");
      const { status, message } = classifyRouteError(error, "Failed to update section");
      res.status(status).json({ message });
    }
  }));

  /**
   * DELETE /api/workflows/:workflowId/sections/:sectionId
   * Delete a section
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async autoRevertToDraft
  app.delete('/api/workflows/:workflowId/sections/:sectionId', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { workflowId, sectionId } = req.params;
      await sectionService.deleteSection(sectionId, workflowId, userId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error deleting section");
      const { status, message } = classifyRouteError(error, "Failed to delete section");
      res.status(status).json({ message });
    }
  }));

  // ===================================================================
  // SIMPLIFIED SECTION ENDPOINTS (without workflowId in path)
  // These endpoints look up the workflow from the section automatically
  // ===================================================================

  /**
   * PUT /api/sections/:sectionId
   * Update a section (workflow looked up automatically)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookupWorkflowIdMiddleware
  app.put('/api/sections/:sectionId', hybridAuth, lookupWorkflowIdMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { sectionId } = req.params;
      const updateData = insertSectionSchema.partial().parse(req.body);
      const updatedSection = await sectionService.updateSectionById(sectionId, userId, updateData);
      res.json(updatedSection);
    } catch (error) {
      logger.error({ error }, "Error updating section");
      const { status, message } = classifyRouteError(error, "Failed to update section");
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/sections/:sectionId/delete-impact
   * Preview the answers/runs that would be permanently destroyed by
   * deleting this section, aggregated across all its steps (workflow
   * looked up automatically). Read-only — used to gate the client's
   * destructive-confirm dialog (ICW2-13).
   */
  app.get('/api/sections/:sectionId/delete-impact', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { sectionId } = req.params;
      const impact = await sectionService.getSectionDeleteImpactById(sectionId, userId);
      res.json(impact);
    } catch (error) {
      logger.error({ error }, "Error fetching section delete impact");
      const { status, message } = classifyRouteError(error, "Failed to fetch section delete impact");
      res.status(status).json({ message });
    }
  }));

  /**
   * DELETE /api/sections/:sectionId
   * Delete a section (workflow looked up automatically)
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- Express middleware chain with async lookupWorkflowIdMiddleware
  app.delete('/api/sections/:sectionId', hybridAuth, lookupWorkflowIdMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }
      const { sectionId } = req.params;
      await sectionService.deleteSectionById(sectionId, userId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error deleting section");
      const { status, message } = classifyRouteError(error, "Failed to delete section");
      res.status(status).json({ message });
    }
  }));
}
