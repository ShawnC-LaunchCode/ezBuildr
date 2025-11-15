import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../googleAuth";
import { insertSectionSchema } from "@shared/schema";
import { sectionService } from "../services/SectionService";
import { z } from "zod";
import { createLogger } from "../logger";
import { creatorOrRunTokenAuth, type RunAuthRequest } from "../middleware/runTokenAuth";

const logger = createLogger({ module: "sections-routes" });

/**
 * Register section-related routes
 * Handles section CRUD operations and reordering
 */
export function registerSectionRoutes(app: Express): void {
  /**
   * POST /api/workflows/:workflowId/sections
   * Create a new section
   */
  app.post('/api/workflows/:workflowId/sections', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
  });

  /**
   * GET /api/workflows/:workflowId/sections
   * Get all sections for a workflow
   * Accepts creator session OR Bearer runToken
   */
  app.get('/api/workflows/:workflowId/sections', creatorOrRunTokenAuth, async (req: RunAuthRequest, res: Response) => {
    try {
      // Get userId from either session auth or bearer token auth
      const userId = req.user?.claims?.sub;
      const runAuth = req.runAuth;

      // For run token auth, we need to verify the workflowId matches
      if (runAuth) {
        const { workflowId } = req.params;
        if (runAuth.workflowId !== workflowId) {
          return res.status(403).json({ message: "Access denied - workflow mismatch" });
        }
        // For preview runs, we can fetch sections without userId check
        const sections = await sectionService.getSectionsByWorkflowId(workflowId);
        return res.json(sections);
      }

      // For session auth, we need userId
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
  });

  /**
   * GET /api/workflows/:workflowId/sections/:sectionId
   * Get a single section with steps
   */
  app.get('/api/workflows/:workflowId/sections/:sectionId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
  });

  /**
   * PUT /api/workflows/:workflowId/sections/reorder
   * Reorder sections
   * NOTE: This route MUST come before /:sectionId routes to avoid "reorder" being treated as an ID
   */
  app.put('/api/workflows/:workflowId/sections/reorder', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
  });

  /**
   * PUT /api/workflows/:workflowId/sections/:sectionId
   * Update a section
   */
  app.put('/api/workflows/:workflowId/sections/:sectionId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
  });

  /**
   * DELETE /api/workflows/:workflowId/sections/:sectionId
   * Delete a section
   */
  app.delete('/api/workflows/:workflowId/sections/:sectionId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
  });

  // ===================================================================
  // SIMPLIFIED SECTION ENDPOINTS (without workflowId in path)
  // These endpoints look up the workflow from the section automatically
  // ===================================================================

  /**
   * PUT /api/sections/:sectionId
   * Update a section (workflow looked up automatically)
   */
  app.put('/api/sections/:sectionId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { sectionId } = req.params;
      const updateData = req.body;

      const section = await sectionService.updateSectionById(sectionId, userId, updateData);
      res.json(section);
    } catch (error) {
      logger.error({ error }, "Error updating section");
      const message = error instanceof Error ? error.message : "Failed to update section";
      const status = message.includes("not found") ? 404 : message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/sections/:sectionId
   * Delete a section (workflow looked up automatically)
   */
  app.delete('/api/sections/:sectionId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
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
  });
}
