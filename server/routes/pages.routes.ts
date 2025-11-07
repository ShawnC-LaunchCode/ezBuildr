import type { Express, Request, Response } from "express";
import { pageRepository } from "../repositories";
import { isAuthenticated } from "../googleAuth";
import { insertSurveyPageSchema } from "@shared/schema";
import { surveyService } from "../services";
import { createLogger } from "../logger";

const logger = createLogger({ module: 'pages-routes' });

/**
 * Register survey page-related routes
 * Handles page CRUD operations and reordering
 */
export function registerPageRoutes(app: Express): void {

  /**
   * POST /api/surveys/:surveyId/pages
   * Create a new page for a survey
   */
  app.post('/api/surveys/:surveyId/pages', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(req.params.surveyId, userId);

      const pageData = insertSurveyPageSchema.parse({ ...req.body, surveyId: req.params.surveyId });
      const page = await pageRepository.create(pageData);
      res.json(page);
    } catch (error) {
      logger.error({ error }, "Error creating page");
      if (error instanceof Error && error.message.includes("Access denied")) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to create page" });
    }
  });

  /**
   * GET /api/surveys/:surveyId/pages
   * Get all pages for a survey (with optional nested questions)
   */
  app.get('/api/surveys/:surveyId/pages', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(req.params.surveyId, userId);

      // Check if client wants questions included
      const includeQuestions = req.query.includeQuestions === 'true';

      const pages = includeQuestions
        ? await pageRepository.findBySurveyWithQuestions(req.params.surveyId)
        : await pageRepository.findBySurvey(req.params.surveyId);

      res.json(pages);
    } catch (error) {
      logger.error({ error }, "Error fetching pages");
      if (error instanceof Error && error.message.includes("Access denied")) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to fetch pages" });
    }
  });

  /**
   * PUT /api/surveys/:surveyId/pages/:pageId
   * Update a single page
   */
  app.put('/api/surveys/:surveyId/pages/:pageId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(req.params.surveyId, userId);

      const updatedPage = await pageRepository.update(req.params.pageId, req.body);
      res.json(updatedPage);
    } catch (error) {
      logger.error({ error }, "Error updating page");
      if (error instanceof Error && error.message.includes("Access denied")) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to update page" });
    }
  });

  /**
   * PUT /api/surveys/:surveyId/pages/reorder
   * Bulk reorder pages within a survey
   */
  app.put('/api/surveys/:surveyId/pages/reorder', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(req.params.surveyId, userId);

      const { pages } = req.body;
      if (!pages || !Array.isArray(pages)) {
        return res.status(400).json({ message: "Invalid request: pages array is required" });
      }

      // Validate pages data
      for (const page of pages) {
        if (!page.id || typeof page.order !== 'number') {
          return res.status(400).json({ message: "Invalid page data: id and order are required" });
        }
      }

      const reorderedPages = await pageRepository.bulkReorder(req.params.surveyId, pages);
      res.json(reorderedPages);
    } catch (error) {
      logger.error({ error }, "Error reordering pages");
      if (error instanceof Error && error.message.includes("Access denied")) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to reorder pages" });
    }
  });
}
