import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { autoRevertToDraft } from "../middleware/autoRevertToDraft";
import { sectionRepository } from "../repositories/SectionRepository";
import { sectionService } from "../services/SectionService";
import { asyncHandler } from "../utils/asyncHandler";
import type { Express, Request, Response, NextFunction } from "express";
const logger = createLogger({ module: "sections-routes" });
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
    // Add workflowId to params so autoRevertToDraft can access it
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
export function registerSectionRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/sections
   * Create a new section
   */
  app.post('/api/workflows/:workflowId/sections', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const { workflowId } = req.params;
      const sectionData = req.body;
      const section = await sectionService.createSection(workflowId, userId, sectionData);
      res.status(201).json(section);
    } catch (error) {
      logger.error({ error }, "Error creating section");
      const message = error instanceof Error ? error.message : "Failed to create section";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
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
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const { workflowId } = req.params;
      const sections = await sectionService.getSections(workflowId, userId);
      res.json(sections);
    } catch (error) {
      logger.error({ error }, "Error fetching sections");
      const message = error instanceof Error ? error.message : "Failed to fetch sections";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
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
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const { workflowId, sectionId } = req.params;
      const section = await sectionService.getSectionWithSteps(sectionId, workflowId, userId);
      res.json(section);
    } catch (error) {
      logger.error({ error }, "Error fetching section");
      const message = error instanceof Error ? error.message : "Failed to fetch section";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  }));
  /**
   * PUT /api/workflows/:workflowId/sections/reorder
   * Reorder sections
   * NOTE: This route MUST come before /:sectionId routes to avoid "reorder" being treated as an ID
   */
  app.put('/api/workflows/:workflowId/sections/reorder', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const { workflowId } = req.params;
      const { sections } = req.body;
      if (!Array.isArray(sections)) {
        return res.status(400).json({ message: "Invalid sections array" });
      }
      // Log the sections data for debugging
      logger.info({ sections, workflowId }, "Reordering sections");
      // Validate that all section IDs are valid UUIDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const section of sections) {
        if (!section.id || !uuidRegex.test(section.id)) {
          logger.error({ invalidSection: section }, "Invalid section ID format");
          return res.status(400).json({
            message: `Invalid section ID format: ${section.id}`,
            details: "Section ID must be a valid UUID"
          });
        }
      }
      await sectionService.reorderSections(workflowId, userId, sections);
      res.status(200).json({ message: "Sections reordered successfully" });
    } catch (error) {
      logger.error({ error }, "Error reordering sections");
      const message = error instanceof Error ? error.message : "Failed to reorder sections";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  }));
  /**
   * PUT /api/workflows/:workflowId/sections/:sectionId
   * Update a section
   */
  app.put('/api/workflows/:workflowId/sections/:sectionId', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const { workflowId, sectionId } = req.params;
      const updateData = req.body;
      const section = await sectionService.updateSection(sectionId, workflowId, userId, updateData);
      res.json(section);
    } catch (error) {
      logger.error({ error }, "Error updating section");
      const message = error instanceof Error ? error.message : "Failed to update section";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  }));
  /**
   * DELETE /api/workflows/:workflowId/sections/:sectionId
   * Delete a section
   */
  app.delete('/api/workflows/:workflowId/sections/:sectionId', hybridAuth, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const { workflowId, sectionId } = req.params;
      await sectionService.deleteSection(sectionId, workflowId, userId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error deleting section");
      const message = error instanceof Error ? error.message : "Failed to delete section";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
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
  app.put('/api/sections/:sectionId', hybridAuth, lookupWorkflowIdMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const { sectionId } = req.params;
      const updateData = req.body;
      const updatedSection = await sectionService.updateSectionById(sectionId, userId, updateData);
      res.json(updatedSection);
    } catch (error) {
      logger.error({ error }, "Error updating section");
      const message = error instanceof Error ? error.message : "Failed to update section";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  }));
  /**
   * DELETE /api/sections/:sectionId
   * Delete a section (workflow looked up automatically)
   */
  app.delete('/api/sections/:sectionId', hybridAuth, lookupWorkflowIdMiddleware, autoRevertToDraft, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const { sectionId } = req.params;
      await sectionService.deleteSectionById(sectionId, userId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, "Error deleting section");
      const message = error instanceof Error ? error.message : "Failed to delete section";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  }));
}