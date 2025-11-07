import type { Express, Request, Response } from "express";
import { isAdmin } from "../middleware/adminAuth";
import { userRepository } from "../repositories/UserRepository";
import { surveyRepository } from "../repositories/SurveyRepository";
import { responseRepository } from "../repositories/ResponseRepository";
import { systemStatsRepository } from "../repositories/SystemStatsRepository";
import { ActivityLogService } from "../services/ActivityLogService";
import { createLogger } from "../logger";

const logger = createLogger({ module: 'admin-routes' });
const activityLogService = new ActivityLogService();

/**
 * Register admin-only routes
 * These routes require admin role for access
 */
export function registerAdminRoutes(app: Express): void {

  // ============================================================================
  // User Management
  // ============================================================================

  /**
   * GET /api/admin/users
   * Get all users in the system
   */
  app.get('/api/admin/users', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const users = await userRepository.findAllUsers();

      // Return users with survey count
      const usersWithStats = await Promise.all(
        users.map(async (user) => {
          const surveys = await surveyRepository.findByCreator(user.id);
          return {
            ...user,
            surveyCount: surveys.length,
          };
        })
      );

      logger.info(
        { adminId: req.adminUser!.id, userCount: users.length },
        'Admin fetched all users'
      );

      res.json(usersWithStats);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error fetching all users');
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  /**
   * PUT /api/admin/users/:userId/role
   * Update user role (promote/demote admin)
   */
  app.put('/api/admin/users/:userId/role', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { userId } = req.params;
      const { role } = req.body;

      if (!role || (role !== 'admin' && role !== 'creator')) {
        return res.status(400).json({
          message: "Invalid role. Must be 'admin' or 'creator'"
        });
      }

      // Prevent self-demotion
      if (userId === req.adminUser!.id && role === 'creator') {
        return res.status(400).json({
          message: "You cannot demote yourself from admin"
        });
      }

      // Critical: Prevent demoting the last admin
      if (role === 'creator') {
        const allUsers = await userRepository.findAllUsers();
        const adminCount = allUsers.filter(u => u.role === 'admin').length;

        // Check if the user being demoted is currently an admin
        const targetUser = allUsers.find(u => u.id === userId);
        if (targetUser?.role === 'admin' && adminCount <= 1) {
          return res.status(400).json({
            message: "Cannot demote the last admin. Promote another user to admin first."
          });
        }
      }

      const updatedUser = await userRepository.updateRole(userId, role);

      logger.info(
        {
          adminId: req.adminUser!.id,
          targetUserId: userId,
          newRole: role,
          oldRole: role === 'admin' ? 'creator' : 'admin'
        },
        `Admin ${role === 'admin' ? 'promoted' : 'demoted'} user`
      );

      res.json({
        message: `User ${role === 'admin' ? 'promoted to admin' : 'demoted to creator'}`,
        user: updatedUser
      });
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, userId: req.params.userId },
        'Error updating user role'
      );

      if (error instanceof Error && error.message === 'User not found') {
        return res.status(404).json({ message: "User not found" });
      }

      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  /**
   * GET /api/admin/users/:userId/surveys
   * Get all surveys for a specific user
   */
  app.get('/api/admin/users/:userId/surveys', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { userId } = req.params;

      // Verify user exists
      const user = await userRepository.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const surveys = await surveyRepository.findByCreator(userId);

      logger.info(
        { adminId: req.adminUser!.id, targetUserId: userId, surveyCount: surveys.length },
        'Admin fetched user surveys'
      );

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        surveys
      });
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, userId: req.params.userId },
        'Error fetching user surveys'
      );
      res.status(500).json({ message: "Failed to fetch user surveys" });
    }
  });

  // ============================================================================
  // Survey Management (Admin can view/edit any survey)
  // ============================================================================

  /**
   * GET /api/admin/surveys
   * Get all surveys in the system
   */
  app.get('/api/admin/surveys', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get all users first
      const users = await userRepository.findAllUsers();

      // Get surveys for each user
      const allSurveys = await Promise.all(
        users.map(async (user) => {
          const surveys = await surveyRepository.findByCreator(user.id);
          return surveys.map(survey => ({
            ...survey,
            creator: {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
            }
          }));
        })
      );

      const flattenedSurveys = allSurveys.flat();

      logger.info(
        { adminId: req.adminUser!.id, surveyCount: flattenedSurveys.length },
        'Admin fetched all surveys'
      );

      res.json(flattenedSurveys);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error fetching all surveys');
      res.status(500).json({ message: "Failed to fetch surveys" });
    }
  });

  /**
   * GET /api/admin/surveys/:surveyId
   * Get any survey (including full details)
   */
  app.get('/api/admin/surveys/:surveyId', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const survey = await surveyRepository.findById(req.params.surveyId);

      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      logger.info(
        { adminId: req.adminUser!.id, surveyId: req.params.surveyId },
        'Admin fetched survey details'
      );

      res.json(survey);
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, surveyId: req.params.surveyId },
        'Error fetching survey'
      );
      res.status(500).json({ message: "Failed to fetch survey" });
    }
  });

  /**
   * GET /api/admin/surveys/:surveyId/responses
   * Get all responses for any survey
   */
  app.get('/api/admin/surveys/:surveyId/responses', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const survey = await surveyRepository.findById(req.params.surveyId);

      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const responses = await responseRepository.findBySurvey(req.params.surveyId);

      logger.info(
        { adminId: req.adminUser!.id, surveyId: req.params.surveyId, responseCount: responses.length },
        'Admin fetched survey responses'
      );

      res.json(responses);
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, surveyId: req.params.surveyId },
        'Error fetching survey responses'
      );
      res.status(500).json({ message: "Failed to fetch responses" });
    }
  });

  /**
   * PUT /api/admin/surveys/:surveyId
   * Update any survey
   */
  app.put('/api/admin/surveys/:surveyId', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const survey = await surveyRepository.findById(req.params.surveyId);

      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      const updatedSurvey = await surveyRepository.update(req.params.surveyId, req.body);

      logger.info(
        { adminId: req.adminUser!.id, surveyId: req.params.surveyId },
        'Admin updated survey'
      );

      res.json(updatedSurvey);
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, surveyId: req.params.surveyId },
        'Error updating survey'
      );
      res.status(500).json({ message: "Failed to update survey" });
    }
  });

  /**
   * DELETE /api/admin/surveys/:surveyId
   * Delete any survey
   */
  app.delete('/api/admin/surveys/:surveyId', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const survey = await surveyRepository.findById(req.params.surveyId);

      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      // Count responses before deletion (they'll be cascade deleted)
      const responses = await responseRepository.findBySurvey(req.params.surveyId);
      const responseCount = responses.length;

      // Delete the survey (cascade deletes responses)
      await surveyRepository.delete(req.params.surveyId);

      // Update system stats
      await systemStatsRepository.incrementSurveysDeleted(1, responseCount);

      logger.warn(
        {
          adminId: req.adminUser!.id,
          surveyId: req.params.surveyId,
          surveyTitle: survey.title,
          deletedResponses: responseCount
        },
        'Admin deleted survey'
      );

      res.json({ message: "Survey deleted successfully" });
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, surveyId: req.params.surveyId },
        'Error deleting survey'
      );
      res.status(500).json({ message: "Failed to delete survey" });
    }
  });

  // ============================================================================
  // Admin Dashboard Stats
  // ============================================================================

  /**
   * GET /api/admin/stats
   * Get system-wide statistics
   */
  app.get('/api/admin/stats', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const users = await userRepository.findAllUsers();
      const adminCount = users.filter(u => u.role === 'admin').length;

      // Get all surveys across all users
      const allSurveys = await Promise.all(
        users.map(user => surveyRepository.findByCreator(user.id))
      );
      const flattenedSurveys = allSurveys.flat();

      // Get all responses across all surveys
      const allResponses = await Promise.all(
        flattenedSurveys.map(survey => responseRepository.findBySurvey(survey.id))
      );
      const flattenedResponses = allResponses.flat();

      // Get historical stats
      const systemStats = await systemStatsRepository.getStats();

      const stats = {
        totalUsers: users.length,
        adminUsers: adminCount,
        creatorUsers: users.length - adminCount,
        totalSurveys: flattenedSurveys.length,
        activeSurveys: flattenedSurveys.filter(s => s.status === 'open').length,
        draftSurveys: flattenedSurveys.filter(s => s.status === 'draft').length,
        closedSurveys: flattenedSurveys.filter(s => s.status === 'closed').length,
        totalResponses: flattenedResponses.length,
        completedResponses: flattenedResponses.filter(r => r.completed).length,
        // Historical totals (including deleted items)
        totalSurveysEverCreated: systemStats.totalSurveysCreated,
        totalSurveysDeleted: systemStats.totalSurveysDeleted,
        totalResponsesEverCollected: systemStats.totalResponsesCollected,
        totalResponsesDeleted: systemStats.totalResponsesDeleted,
      };

      logger.info({ adminId: req.adminUser!.id }, 'Admin fetched system stats');

      res.json(stats);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error fetching admin stats');
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  });

  // ============================================================================
  // Activity Logs
  // ============================================================================

  /**
   * GET /api/admin/logs
   * Get activity logs with filtering and pagination
   */
  app.get('/api/admin/logs', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const query = {
        q: req.query.q as string | undefined,
        event: req.query.event as string | undefined,
        actor: req.query.actor as string | undefined,
        entityType: req.query.entityType as string | undefined,
        entityId: req.query.entityId as string | undefined,
        status: req.query.status as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        sort: (req.query.sort as "timestamp_desc" | "timestamp_asc") || "timestamp_desc",
      };

      const result = await activityLogService.list(query);

      logger.info(
        {
          adminId: req.adminUser!.id,
          query,
          resultCount: result.rows.length,
          total: result.total
        },
        'Admin fetched activity logs'
      );

      res.json(result);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error fetching activity logs');
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  /**
   * GET /api/admin/logs/export
   * Export activity logs to CSV
   */
  app.get('/api/admin/logs/export', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const query = {
        q: req.query.q as string | undefined,
        event: req.query.event as string | undefined,
        actor: req.query.actor as string | undefined,
        entityType: req.query.entityType as string | undefined,
        entityId: req.query.entityId as string | undefined,
        status: req.query.status as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        sort: (req.query.sort as "timestamp_desc" | "timestamp_asc") || "timestamp_desc",
        limit: 5000, // Export limit
        offset: 0,
      };

      const { filename, csv } = await activityLogService.exportCsv(query);

      logger.info(
        { adminId: req.adminUser!.id, query, filename },
        'Admin exported activity logs to CSV'
      );

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error exporting activity logs');
      res.status(500).json({ message: "Failed to export activity logs" });
    }
  });

  /**
   * GET /api/admin/logs/events
   * Get unique event types for filter dropdowns
   */
  app.get('/api/admin/logs/events', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const events = await activityLogService.getUniqueEvents();

      logger.info(
        { adminId: req.adminUser!.id, eventCount: events.length },
        'Admin fetched unique event types'
      );

      res.json(events);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error fetching event types');
      res.status(500).json({ message: "Failed to fetch event types" });
    }
  });

  /**
   * GET /api/admin/logs/actors
   * Get unique actors for filter dropdowns
   */
  app.get('/api/admin/logs/actors', isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const actors = await activityLogService.getUniqueActors();

      logger.info(
        { adminId: req.adminUser!.id, actorCount: actors.length },
        'Admin fetched unique actors'
      );

      res.json(actors);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error fetching actors');
      res.status(500).json({ message: "Failed to fetch actors" });
    }
  });
}
