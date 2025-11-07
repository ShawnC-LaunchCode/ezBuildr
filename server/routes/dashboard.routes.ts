import type { Express, Request, Response } from "express";
import { surveyRepository } from "../repositories";
import { analyticsService } from "../services/AnalyticsService";
import { isAuthenticated } from "../googleAuth";
import { ActivityLogService } from "../services/ActivityLogService";
import type { ActivityItem } from "@shared/schema";
import { randomUUID } from "crypto";
import { createLogger } from "../logger";

const logger = createLogger({ module: 'dashboard-routes' });

/**
 * Register dashboard-related routes
 * Provides overview statistics and metrics for the creator dashboard
 */
export function registerDashboardRoutes(app: Express): void {
  const activityLogService = new ActivityLogService();

  /**
   * GET /api/dashboard/stats
   * Get dashboard statistics for the authenticated user
   */
  app.get('/api/dashboard/stats', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const stats = await analyticsService.getDashboardStats(userId);

      res.json(stats);
    } catch (error) {
      logger.error({ error }, "Error fetching dashboard stats");
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  /**
   * GET /api/dashboard/analytics
   * Get analytics for all surveys owned by the user
   */
  app.get('/api/dashboard/analytics', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const analytics = await analyticsService.getSurveyAnalytics(userId);

      res.json(analytics);
    } catch (error) {
      logger.error({ error }, "Error fetching dashboard analytics");
      res.status(500).json({ message: "Failed to fetch dashboard analytics" });
    }
  });

  /**
   * GET /api/dashboard/trends
   * Get response trends across all surveys
   */
  app.get('/api/dashboard/trends', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const trends = await analyticsService.getResponseTrends(userId);

      res.json(trends);
    } catch (error) {
      logger.error({ error }, "Error fetching response trends");
      res.status(500).json({ message: "Failed to fetch response trends" });
    }
  });

  /**
   * GET /api/dashboard/activity
   * Get recent activity across all surveys using the analytics events
   */
  app.get('/api/dashboard/activity', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const limit = parseInt(req.query.limit as string) || 20;

      // Get user's surveys to filter activity
      const userSurveys = await surveyRepository.findByCreator(userId);
      const surveyIds = userSurveys.map(s => s.id);

      if (surveyIds.length === 0) {
        return res.json([]);
      }

      // Query all activity logs across user's surveys
      const activities: ActivityItem[] = [];
      const surveyMap = new Map(userSurveys.map(s => [s.id, s]));

      // Get recent activities (we'll filter by survey IDs client-side since
      // the ActivityLogRepository doesn't support IN queries yet)
      const { rows } = await activityLogService.list({
        limit: 200,  // Get more to ensure we have enough after filtering
        sort: "timestamp_desc"
      });

      // Filter to only activities for the user's surveys and map to ActivityItem format
      for (const log of rows) {
        // Skip if this activity is not for one of the user's surveys
        if (!log.entityId || !surveyMap.has(log.entityId)) continue;

        const survey = surveyMap.get(log.entityId)!;
        let activityItem: ActivityItem | null = null;

        switch (log.event) {
          case 'survey_start':
            activityItem = {
              id: log.id,
              type: 'response_received',
              title: survey.title,
              description: 'New response started',
              timestamp: new Date(log.timestamp),
              surveyId: survey.id,
              responseId: log.actorId || undefined
            };
            break;

          case 'survey_complete':
            activityItem = {
              id: log.id,
              type: 'response_received',
              title: survey.title,
              description: 'Response completed',
              timestamp: new Date(log.timestamp),
              surveyId: survey.id,
              responseId: log.actorId || undefined
            };
            break;

          case 'page_view':
            activityItem = {
              id: log.id,
              type: 'response_received',
              title: survey.title,
              description: 'Viewing page',
              timestamp: new Date(log.timestamp),
              surveyId: survey.id,
              responseId: log.actorId || undefined
            };
            break;

          case 'question_answer':
            activityItem = {
              id: log.id,
              type: 'response_received',
              title: survey.title,
              description: 'Question answered',
              timestamp: new Date(log.timestamp),
              surveyId: survey.id,
              responseId: log.actorId || undefined
            };
            break;
        }

        if (activityItem) {
          activities.push(activityItem);
          // Stop once we have enough activities for the requested limit
          if (activities.length >= limit) break;
        }
      }

      // Sort by timestamp descending and limit
      const sortedActivities = activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      res.json(sortedActivities);
    } catch (error) {
      logger.error({ error }, "Error fetching recent activity");
      res.status(500).json({ message: "Failed to fetch recent activity" });
    }
  });

  /**
   * GET /api/dashboard/surveys
   * Get recent surveys with basic stats
   */
  app.get('/api/dashboard/surveys', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string | undefined;

      const surveys = await surveyRepository.findByCreator(userId);

      // Filter by status if provided
      let filteredSurveys = surveys;
      if (status && ['draft', 'open', 'closed'].includes(status)) {
        filteredSurveys = surveys.filter(s => s.status === status);
      }

      // Limit results
      const limitedSurveys = filteredSurveys.slice(0, limit);

      res.json(limitedSurveys);
    } catch (error) {
      logger.error({ error }, "Error fetching dashboard surveys");
      res.status(500).json({ message: "Failed to fetch dashboard surveys" });
    }
  });
}
