import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../googleAuth";
import { templateService } from "../services/TemplateService";
import { templateInsertionService } from "../services/TemplateInsertionService";
import { templateSharingService } from "../services/TemplateSharingService";
import { z } from "zod";

/**
 * Register template-related routes
 * Handles survey template CRUD operations
 */
export function registerTemplateRoutes(app: Express): void {

  /**
   * GET /api/templates
   * List all templates accessible to the user (their own + system templates)
   */
  app.get('/api/templates', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const templates = await templateService.listAll(userId);
      res.json(templates);
    } catch (error) {
      logger.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  /**
   * POST /api/templates/from-survey/:id
   * Create a template from an existing survey
   */
  app.post('/api/templates/from-survey/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const surveyId = req.params.id;

      // Validate request body
      const schema = z.object({
        name: z.string().min(1, "Template name is required"),
        description: z.string().optional(),
        tags: z.array(z.string()).optional().default([]),
      });

      const { name, description, tags } = schema.parse(req.body);

      const template = await templateService.createFromSurvey(
        surveyId,
        userId,
        name,
        description,
        tags
      );

      res.status(201).json(template);
    } catch (error) {
      logger.error("Error creating template from survey:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid request data",
          errors: error.errors,
        });
      }

      if (error instanceof Error) {
        if (error.message === "Survey not found or access denied") {
          return res.status(404).json({ message: error.message });
        }
      }

      res.status(500).json({ message: "Failed to create template" });
    }
  });

  /**
   * GET /api/templates/:id
   * Get a single template by ID
   */
  app.get('/api/templates/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const userId = user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const template = await templateService.getById(req.params.id);

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Check access: owner, system template, or has share
      const canAccess = await templateSharingService.canAccess(req.params.id, user);
      if (!canAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(template);
    } catch (error) {
      logger.error("Error fetching template:", error);
      res.status(500).json({ message: "Failed to fetch template" });
    }
  });

  /**
   * PUT /api/templates/:id
   * Update a template (name, description, or content)
   */
  app.put('/api/templates/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const userId = user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Check if user can edit this template (owner, admin, or has "edit" share)
      const canEdit = await templateSharingService.canEdit(req.params.id, user);
      if (!canEdit) {
        return res.status(403).json({ message: "Access denied - you don't have edit permissions" });
      }

      // Validate request body
      const schema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        content: z.unknown().optional(),
        tags: z.array(z.string()).optional(),
      });

      const patch = schema.parse(req.body);

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const template = await templateService.update(req.params.id, userId, patch);

      if (!template) {
        return res.status(404).json({ message: "Template not found or access denied" });
      }

      res.json(template);
    } catch (error) {
      logger.error("Error updating template:", error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid request data",
          errors: error.errors,
        });
      }

      res.status(500).json({ message: "Failed to update template" });
    }
  });

  /**
   * DELETE /api/templates/:id
   * Delete a template
   */
  app.delete('/api/templates/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const deleted = await templateService.delete(req.params.id, userId);

      if (!deleted) {
        return res.status(404).json({ message: "Template not found or access denied" });
      }

      res.json({ deleted: true });
    } catch (error) {
      logger.error("Error deleting template:", error);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  /**
   * POST /api/templates/:templateId/insert/:surveyId
   * Insert a template into an existing survey
   */
  app.post('/api/templates/:templateId/insert/:surveyId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user;
      const userId = user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const { templateId, surveyId } = req.params;

      // Check if user can access this template (owner, admin, system, or has "use" or "edit" share)
      const canAccess = await templateSharingService.canAccess(templateId, user);
      if (!canAccess) {
        return res.status(403).json({ message: "Access denied - you don't have permission to use this template" });
      }

      const result = await templateInsertionService.insertTemplateIntoSurvey(
        templateId,
        surveyId,
        userId
      );

      res.status(201).json(result);
    } catch (error) {
      logger.error("Error inserting template into survey:", error);

      if (error instanceof Error) {
        if (error.message === "Template not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: error.message });
        }
        if (error.message.includes("Invalid template content")) {
          return res.status(400).json({ message: error.message });
        }
      }

      res.status(500).json({ message: "Failed to insert template" });
    }
  });
}
