import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../googleAuth";
import { insertSurveySchema } from "@shared/schema";
import { surveyService, analyticsService } from "../services";
import { surveyRepository, pageRepository, questionRepository, systemStatsRepository } from "../repositories";
import { z } from "zod";
import { exportService } from "../services/exportService";
import { logger } from "../logger";

/**
 * Register survey-related routes
 * Handles survey CRUD operations, validation, status management, and export
 *
 * Uses surveyService for business logic and authorization
 */
export function registerSurveyRoutes(app: Express): void {

  // ============================================================================
  // Core Survey CRUD Operations
  // ============================================================================

  /**
   * POST /api/surveys
   * Create a new survey
   */
  app.post('/api/surveys', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      // Add creatorId to request body before validation
      const surveyData = insertSurveySchema.parse({
        ...req.body,
        creatorId: userId
      });
      const survey = await surveyService.createSurvey(surveyData, userId);

      // Increment system stats counter
      await systemStatsRepository.incrementSurveysCreated();

      res.json(survey);
    } catch (error) {
      logger.error({ error, userId: req.user?.claims?.sub }, "Error creating survey");
      res.status(500).json({
        message: "Failed to create survey",
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined
      });
    }
  });

  /**
   * GET /api/surveys
   * Get all surveys for the authenticated user
   */
  app.get('/api/surveys', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const surveys = await surveyService.getSurveysByCreator(userId);
      res.json(surveys);
    } catch (error) {
      logger.error({ error, userId: req.user?.claims?.sub }, "Error fetching surveys");
      res.status(500).json({ message: "Failed to fetch surveys" });
    }
  });

  /**
   * GET /api/surveys/check/:publicLink
   * TEMPORARY: Check survey status by public link for debugging
   */
  app.get('/api/surveys/check/:publicLink', async (req, res) => {
    try {
      const { publicLink } = req.params;
      const { surveyRepository } = require('../repositories');
      const survey = await surveyRepository.findByPublicLink(publicLink);

      if (!survey) {
        return res.json({ found: false, publicLink });
      }

      res.json({
        found: true,
        title: survey.title,
        status: survey.status,
        allowAnonymous: survey.allowAnonymous,
        anonymousAccessType: survey.anonymousAccessType,
        publicLink: survey.publicLink,
        diagnosis: {
          statusOk: survey.status === 'open',
          anonymousOk: survey.allowAnonymous === true,
          ready: survey.status === 'open' && survey.allowAnonymous === true
        }
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * GET /api/surveys/:id
   * Get a single survey by ID (with ownership check)
   */
  app.get('/api/surveys/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }
      const survey = await surveyService.getSurveyForUser(req.params.id, userId);

      res.json(survey);
    } catch (error) {
      logger.error({ error, surveyId: req.params.id, userId: req.user?.claims?.sub }, "Error fetching survey");
      if (error instanceof Error) {
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to fetch survey" });
    }
  });

  /**
   * PUT /api/surveys/:id
   * Update a survey
   */
  app.put('/api/surveys/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }
      const updates = insertSurveySchema.partial().parse(req.body);

      const updatedSurvey = await surveyService.updateSurvey(req.params.id, userId, updates);
      res.json(updatedSurvey);
    } catch (error) {
      logger.error({ error, surveyId: req.params.id, userId: req.user?.claims?.sub }, "Error updating survey");
      if (error instanceof Error) {
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to update survey" });
    }
  });

  /**
   * DELETE /api/surveys/:id
   * Delete a survey
   */
  app.delete('/api/surveys/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }
      await surveyService.deleteSurvey(req.params.id, userId);

      res.json({ message: "Survey deleted successfully" });
    } catch (error) {
      logger.error({ error, surveyId: req.params.id, userId: req.user?.claims?.sub }, "Error deleting survey");
      if (error instanceof Error) {
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to delete survey" });
    }
  });

  // ============================================================================
  // Survey Validation & Status Management
  // ============================================================================

  /**
   * GET /api/surveys/:id/validate
   * Validate a survey for publishing
   */
  app.get('/api/surveys/:id/validate', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }
      const validation = await surveyService.validateForPublish(req.params.id, userId);

      res.json(validation);
    } catch (error) {
      logger.error({ error, surveyId: req.params.id, userId: req.user?.claims?.sub }, "Error validating survey");
      if (error instanceof Error) {
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to validate survey" });
    }
  });

  /**
   * PUT /api/surveys/:id/status
   * Change survey status (draft, open, closed)
   */
  app.put('/api/surveys/:id/status', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }
      const { status } = req.body;

      const result = await surveyService.changeStatus(req.params.id, userId, status);
      res.json(result);
    } catch (error) {
      logger.error({ error, surveyId: req.params.id, userId: req.user?.claims?.sub, status: req.body.status }, "Error updating survey status");
      if (error instanceof Error) {
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: error.message });
        }
        if (error.message.includes("Invalid status") || error.message.includes("not allowed")) {
          return res.status(400).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to update survey status" });
    }
  });

  // ============================================================================
  // Anonymous Access Management
  // ============================================================================

  /**
   * GET /api/survey/:identifier
   * Get survey data by public link identifier
   */
  app.get('/api/survey/:identifier', async (req, res) => {
    try {
      const { identifier } = req.params;
      logger.info({ identifier }, 'Survey request received for identifier');

      const surveyData = await surveyService.getSurveyByPublicLink(identifier);

      logger.info({
        surveyId: surveyData.survey.id,
        title: surveyData.survey.title,
        status: surveyData.survey.status,
        allowAnonymous: surveyData.survey.allowAnonymous,
        pageCount: surveyData.pages.length
      }, 'Survey found via public link');

      return res.json({
        survey: surveyData.survey,
        pages: surveyData.pages,
        anonymous: true
      });
    } catch (error) {
      logger.error({ error, identifier: req.params.identifier }, "Survey error");
      if (error instanceof Error) {
        if (error.message === "Survey not found" || error.message === "Survey not available") {
          return res.status(404).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to fetch survey" });
    }
  });

  /**
   * GET /api/anonymous-survey/:publicLink
   * Get survey data for anonymous respondents using public link
   */
  app.get('/api/anonymous-survey/:publicLink', async (req, res) => {
    try {
      const { publicLink } = req.params;
      logger.info({ publicLink }, 'Anonymous survey request received for public link');

      const surveyData = await surveyService.getSurveyByPublicLink(publicLink);

      logger.info({
        surveyId: surveyData.survey.id,
        title: surveyData.survey.title,
        status: surveyData.survey.status,
        allowAnonymous: surveyData.survey.allowAnonymous,
        pageCount: surveyData.pages.length
      }, 'Anonymous survey found');

      res.json({
        survey: surveyData.survey,
        pages: surveyData.pages,
        anonymous: true
      });
    } catch (error) {
      logger.error({ error, publicLink: req.params.publicLink }, "Anonymous survey error");
      if (error instanceof Error) {
        if (error.message === "Survey not found" || error.message === "Survey not available") {
          return res.status(404).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to fetch survey" });
    }
  });

  /**
   * POST /api/surveys/:id/anonymous
   * Enable anonymous access for a survey
   */
  app.post('/api/surveys/:id/anonymous', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const surveyId = req.params.id;
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }
      const { accessType, anonymousConfig } = req.body;

      const updatedSurvey = await surveyService.enableAnonymousAccess(
        surveyId,
        userId,
        { accessType, anonymousConfig }
      );

      res.json({
        survey: updatedSurvey,
        publicLink: `${req.protocol}://${req.get('host')}/survey/${updatedSurvey.publicLink}`
      });
    } catch (error) {
      logger.error({ error, surveyId: req.params.id, userId: req.user?.claims?.sub }, "Error enabling anonymous access");
      if (error instanceof Error) {
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: error.message });
        }
        res.status(500).json({
          message: "Failed to enable anonymous access",
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      } else {
        res.status(500).json({ message: "Failed to enable anonymous access" });
      }
    }
  });

  /**
   * DELETE /api/surveys/:id/anonymous
   * Disable anonymous access for a survey
   */
  app.delete('/api/surveys/:id/anonymous', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }
      const updatedSurvey = await surveyService.disableAnonymousAccess(req.params.id, userId);

      res.json(updatedSurvey);
    } catch (error) {
      logger.error({ error, surveyId: req.params.id, userId: req.user?.claims?.sub }, "Error disabling anonymous access");
      if (error instanceof Error) {
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to disable anonymous access" });
    }
  });

  // ============================================================================
  // Survey Results & Analytics
  // ============================================================================

  /**
   * GET /api/surveys/:id/results
   * Get survey results with analytics
   */
  app.get('/api/surveys/:id/results', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const surveyId = req.params.id;
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }

      const results = await analyticsService.getSurveyResults(surveyId, userId);
      res.json(results);
    } catch (error) {
      logger.error({ error, surveyId: req.params.id, userId: req.user?.claims?.sub }, "Error fetching survey results");
      if (error instanceof Error) {
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to fetch survey results" });
    }
  });

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * POST /api/surveys/bulk/status
   * Bulk update survey statuses
   */
  app.post('/api/surveys/bulk/status', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }
      const { surveyIds, status } = req.body;

      if (!Array.isArray(surveyIds) || !status) {
        return res.status(400).json({ message: "Invalid request data" });
      }

      const result = await surveyService.bulkUpdateStatus(surveyIds, status, userId);
      res.json(result);
    } catch (error) {
      logger.error({ error, surveyIds: req.body.surveyIds, status: req.body.status, userId: req.user?.claims?.sub }, "Error in bulk status update");
      res.status(500).json({ message: "Failed to update survey statuses" });
    }
  });

  /**
   * POST /api/surveys/bulk/delete
   * Bulk delete surveys
   */
  app.post('/api/surveys/bulk/delete', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }
      const { surveyIds } = req.body;

      if (!Array.isArray(surveyIds)) {
        return res.status(400).json({ message: "Invalid request data" });
      }

      const result = await surveyService.bulkDeleteSurveys(surveyIds, userId);
      res.json(result);
    } catch (error) {
      logger.error({ error, surveyIds: req.body.surveyIds, userId: req.user?.claims?.sub }, "Error in bulk delete");
      res.status(500).json({ message: "Failed to delete surveys" });
    }
  });

  // ============================================================================
  // Survey Management Operations
  // ============================================================================

  /**
   * POST /api/surveys/:id/duplicate
   * Duplicate an existing survey
   */
  app.post('/api/surveys/:id/duplicate', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }
      const surveyId = req.params.id;
      const { title } = req.body;

      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      const duplicatedSurvey = await surveyService.duplicateSurvey(surveyId, userId, title);
      res.json(duplicatedSurvey);
    } catch (error) {
      logger.error({ error, surveyId: req.params.id, userId: req.user?.claims?.sub, newTitle: req.body.title }, "Error duplicating survey");
      if (error instanceof Error && error.message.includes("Access denied")) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to duplicate survey" });
    }
  });

  /**
   * POST /api/surveys/:id/archive
   * Archive a survey (set status to 'closed')
   */
  app.post('/api/surveys/:id/archive', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }
      const surveyId = req.params.id;

      const archivedSurvey = await surveyService.archiveSurvey(surveyId, userId);
      res.json(archivedSurvey);
    } catch (error) {
      logger.error({ error, surveyId: req.params.id, userId: req.user?.claims?.sub }, "Error archiving survey");
      if (error instanceof Error && error.message.includes("Access denied")) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to archive survey" });
    }
  });

  // ============================================================================
  // Export Functionality
  // ============================================================================

  /**
   * POST /api/surveys/:surveyId/export
   * Export survey data to CSV or PDF
   */
  app.post('/api/surveys/:surveyId/export', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const surveyId = req.params.surveyId;
      const userId = req.user?.claims?.sub;

      if (!userId) {

        return res.status(401).json({ message: "Unauthorized - no user ID" });

      }

      // Verify ownership
      await surveyService.getSurveyForUser(surveyId, userId);

      const exportOptionsSchema = z.object({
        format: z.enum(['csv', 'pdf']),
        includeIncomplete: z.boolean().optional().default(false),
        dateFrom: z.string().optional().transform(val => val ? new Date(val) : undefined),
        dateTo: z.string().optional().transform(val => val ? new Date(val) : undefined),
        questionIds: z.array(z.string()).optional()
      });

      const options = exportOptionsSchema.parse(req.body);
      const exportedFile = await exportService.exportSurveyData(surveyId, userId, options);

      res.json({
        success: true,
        filename: exportedFile.filename,
        downloadUrl: `/api/exports/download/${exportedFile.filename}`,
        size: exportedFile.size,
        mimeType: exportedFile.mimeType
      });
    } catch (error) {
      logger.error({ error, surveyId: req.params.surveyId, userId: req.user?.claims?.sub, format: req.body.format }, "Error exporting survey data");
      if (error instanceof Error) {
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: error.message });
        }
      }
      res.status(500).json({
        success: false,
        message: "Failed to export survey data",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
