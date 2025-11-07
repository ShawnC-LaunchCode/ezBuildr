import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { surveyRepository, responseRepository, pageRepository, questionRepository, analyticsRepository } from "../repositories";
import { analyticsService } from "../services/AnalyticsService";
import { isAuthenticated } from "../googleAuth";
import { insertAnalyticsEventSchema } from "@shared/schema";
import { surveyService } from "../services";
import { createLogger } from "../logger";

const logger = createLogger({ module: "analytics-routes" });

/**
 * Rate limiting for analytics events
 */
const analyticsRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 analytics events per minute
  message: {
    success: false,
    errors: ['Too many analytics events, please slow down.']
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Register analytics-related routes
 * Handles analytics event tracking and reporting
 */
export function registerAnalyticsRoutes(app: Express): void {

  // ============================================================================
  // Analytics Event Tracking
  // ============================================================================

  /**
   * POST /api/analytics/events
   * Create an analytics event with strict validation
   */
  app.post('/api/analytics/events', analyticsRateLimit, async (req: Request, res: Response) => {
    try {
      const eventData = insertAnalyticsEventSchema.parse(req.body);

      // Verify responseId and surveyId consistency
      const response = await responseRepository.findById(eventData.responseId);
      if (!response) {
        return res.status(400).json({
          success: false,
          message: "Invalid response ID - response does not exist"
        });
      }

      if (response.surveyId !== eventData.surveyId) {
        return res.status(400).json({
          success: false,
          message: "Response ID and survey ID are inconsistent"
        });
      }

      // Validate pageId if provided
      if (eventData.pageId) {
        const page = await pageRepository.findById(eventData.pageId);
        if (!page || page.surveyId !== eventData.surveyId) {
          return res.status(400).json({
            success: false,
            message: "Invalid page ID or page does not belong to specified survey"
          });
        }
      }

      // Validate questionId if provided
      if (eventData.questionId) {
        const question = await questionRepository.findById(eventData.questionId);
        if (!question) {
          return res.status(400).json({
            success: false,
            message: "Invalid question ID - question does not exist"
          });
        }

        if (eventData.pageId && question.pageId !== eventData.pageId) {
          return res.status(400).json({
            success: false,
            message: "Question does not belong to specified page"
          });
        }

        if (!eventData.pageId) {
          const questionPage = await pageRepository.findById(question.pageId);
          if (!questionPage || questionPage.surveyId !== eventData.surveyId) {
            return res.status(400).json({
              success: false,
              message: "Question does not belong to specified survey"
            });
          }
        }
      }

      const event = await analyticsRepository.createEvent({
        ...eventData,
        data: eventData.data || {},
        pageId: eventData.pageId || undefined,
        questionId: eventData.questionId || undefined,
        duration: eventData.duration || undefined
      });

      res.json({ success: true, event });
    } catch (error) {
      logger.error({ error }, "Error creating analytics event");

      if (error instanceof Error && error.name === 'ZodError') {
        const zodError = error as unknown as { errors: unknown[] };
        return res.status(400).json({
          success: false,
          message: "Invalid analytics event data",
          errors: zodError.errors
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to create analytics event"
      });
    }
  });

  // ============================================================================
  // Analytics Reporting Routes
  // ============================================================================

  /**
   * GET /api/surveys/:surveyId/analytics/questions
   * Get question-level analytics
   */
  app.get('/api/surveys/:surveyId/analytics/questions', isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const survey = await surveyRepository.findById(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }
      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, req.user.claims.sub);

      const analytics = await analyticsService.getQuestionAnalytics(req.params.surveyId, req.user.claims.sub);
      res.json(analytics);
    } catch (error) {
      logger.error({ error }, "Error fetching question analytics");
      res.status(500).json({ message: "Failed to fetch question analytics" });
    }
  });

  /**
   * GET /api/surveys/:surveyId/analytics/aggregates
   * Get aggregated question analytics for visualization
   * Returns per-question aggregates (yes/no counts, multiple choice distributions, text keywords)
   */
  app.get('/api/surveys/:surveyId/analytics/aggregates', isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { surveyId } = req.params;
      const userId = req.user.claims.sub;

      const aggregates = await analyticsService.getQuestionAggregates(surveyId, userId);

      res.json({
        surveyId,
        questions: aggregates
      });
    } catch (error) {
      logger.error({ error }, "Error fetching question aggregates");
      if (error instanceof Error) {
        if (error.message === "Survey not found") {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("Access denied")) {
          return res.status(403).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to get question analytics" });
    }
  });

  /**
   * GET /api/surveys/:surveyId/analytics/pages
   * Get page-level analytics
   */
  app.get('/api/surveys/:surveyId/analytics/pages', isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const survey = await surveyRepository.findById(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }
      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, req.user.claims.sub);

      const analytics = await analyticsService.getPageAnalytics(req.params.surveyId, req.user.claims.sub);
      res.json(analytics);
    } catch (error) {
      logger.error({ error }, "Error fetching page analytics");
      res.status(500).json({ message: "Failed to fetch page analytics" });
    }
  });

  /**
   * GET /api/surveys/:surveyId/analytics/funnel
   * Get completion funnel data
   */
  app.get('/api/surveys/:surveyId/analytics/funnel', isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const survey = await surveyRepository.findById(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }
      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, req.user.claims.sub);

      const funnelData = await analyticsService.getCompletionFunnel(req.params.surveyId, req.user.claims.sub);
      res.json(funnelData);
    } catch (error) {
      logger.error({ error }, "Error fetching funnel data");
      res.status(500).json({ message: "Failed to fetch funnel data" });
    }
  });

  /**
   * GET /api/surveys/:surveyId/analytics/time-spent
   * Get time spent data
   */
  app.get('/api/surveys/:surveyId/analytics/time-spent', isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const survey = await surveyRepository.findById(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }
      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, req.user.claims.sub);

      const timeData = await analyticsService.getTimeSpentData(req.params.surveyId, req.user.claims.sub);
      res.json(timeData);
    } catch (error) {
      logger.error({ error }, "Error fetching time spent data");
      res.status(500).json({ message: "Failed to fetch time spent data" });
    }
  });

  /**
   * GET /api/surveys/:surveyId/analytics/engagement
   * Get engagement metrics
   */
  app.get('/api/surveys/:surveyId/analytics/engagement', isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const survey = await surveyRepository.findById(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }
      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, req.user.claims.sub);

      const engagement = await analyticsService.getEngagementMetrics(req.params.surveyId, req.user.claims.sub);
      res.json(engagement);
    } catch (error) {
      logger.error({ error }, "Error fetching engagement metrics");
      res.status(500).json({ message: "Failed to fetch engagement metrics" });
    }
  });

  /**
   * GET /api/surveys/:surveyId/analytics
   * Get overall survey analytics
   */
  app.get('/api/surveys/:surveyId/analytics', isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.user?.claims?.sub) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const survey = await surveyRepository.findById(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }
      // Verify ownership (allows admin access)
      await surveyService.verifyOwnership(survey.id, req.user.claims.sub);

      const analytics = await analyticsRepository.findBySurvey(req.params.surveyId);
      res.json(analytics);
    } catch (error) {
      logger.error({ error }, "Error fetching survey analytics");
      res.status(500).json({ message: "Failed to fetch survey analytics" });
    }
  });
}
