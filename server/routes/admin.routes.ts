import type { Express, Request, Response } from "express";
import { isAdmin } from "../middleware/adminAuth";
import { hybridAuth } from "../middleware/auth";
import { userRepository } from "../repositories/UserRepository";
import { WorkflowRepository } from "../repositories/WorkflowRepository";
import { WorkflowRunRepository } from "../repositories/WorkflowRunRepository";
import { ActivityLogService } from "../services/ActivityLogService";
import { accountLockoutService } from "../services/AccountLockoutService";
import { mfaService } from "../services/MfaService";
import { createLogger } from "../logger";

const logger = createLogger({ module: 'admin-routes' });
const activityLogService = new ActivityLogService();

/**
 * Register admin-only routes
 * These routes require admin role for access
 *
 * NOTE: Refactored from survey-based to workflow-based (Nov 2025)
 */
export function registerAdminRoutes(app: Express): void {
  const workflowRepository = new WorkflowRepository();
  const workflowRunRepository = new WorkflowRunRepository();

  // ============================================================================
  // User Management
  // ============================================================================

  /**
   * GET /api/admin/users
   * Get all users in the system
   */
  app.get('/api/admin/users', hybridAuth, isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Use optimized query to get users and workflow counts in one go
      const usersWithStats = await userRepository.findAllUsersWithWorkflowCounts();

      logger.info(
        { adminId: req.adminUser!.id, userCount: usersWithStats.length },
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
  app.put('/api/admin/users/:userId/role', hybridAuth, isAdmin, async (req: Request, res: Response) => {
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
   * POST /api/admin/users/:userId/unlock
   * Unlock a locked user account
   */
  app.post('/api/admin/users/:userId/unlock', hybridAuth, isAdmin, async (req: Request, res: Response) => {
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

      // Check if account is actually locked
      const lockStatus = await accountLockoutService.isAccountLocked(userId);
      if (!lockStatus.locked) {
        return res.status(400).json({
          message: "Account is not currently locked"
        });
      }

      // Unlock the account
      await accountLockoutService.unlockAccount(userId);

      logger.info(
        {
          adminId: req.adminUser!.id,
          targetUserId: userId,
          targetEmail: user.email
        },
        'Admin unlocked user account'
      );

      res.json({
        message: "Account unlocked successfully",
        user: {
          id: user.id,
          email: user.email
        }
      });
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, userId: req.params.userId },
        'Error unlocking user account'
      );
      res.status(500).json({ message: "Failed to unlock account" });
    }
  });

  /**
   * POST /api/admin/users/:userId/reset-mfa
   * Reset MFA for a user (for locked out users)
   */
  app.post('/api/admin/users/:userId/reset-mfa', hybridAuth, isAdmin, async (req: Request, res: Response) => {
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

      // Check if user has MFA enabled
      if (!user.mfaEnabled) {
        return res.status(400).json({
          message: "User does not have MFA enabled"
        });
      }

      // Reset MFA (disables and deletes all MFA data)
      await mfaService.adminResetMfa(userId);

      logger.warn(
        {
          adminId: req.adminUser!.id,
          targetUserId: userId,
          targetEmail: user.email
        },
        'Admin reset user MFA'
      );

      res.json({
        message: "MFA reset successfully. User can now log in without MFA.",
        user: {
          id: user.id,
          email: user.email
        }
      });
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, userId: req.params.userId },
        'Error resetting user MFA'
      );
      res.status(500).json({ message: "Failed to reset MFA" });
    }
  });

  /**
   * GET /api/admin/users/:userId/workflows
   * Get all workflows for a specific user
   */
  app.get('/api/admin/users/:userId/workflows', hybridAuth, isAdmin, async (req: Request, res: Response) => {
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

      const workflows = await workflowRepository.findByCreatorId(userId);

      logger.info(
        { adminId: req.adminUser!.id, targetUserId: userId, workflowCount: workflows.length },
        'Admin fetched user workflows'
      );

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        workflows
      });
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, userId: req.params.userId },
        'Error fetching user workflows'
      );
      res.status(500).json({ message: "Failed to fetch user workflows" });
    }
  });

  // ============================================================================
  // Workflow Management (Admin can view/edit any workflow)
  // ============================================================================

  /**
   * GET /api/admin/workflows
   * Get all workflows in the system
   */
  app.get('/api/admin/workflows', hybridAuth, isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get all users first (for mapping creators)
      const users = await userRepository.findAllUsers();
      const userMap = new Map(users.map(u => [u.id, u]));

      // Get all workflows directly
      const allWorkflows = await workflowRepository.findAll();

      const workflowsWithCreators = allWorkflows.map((workflow) => {
        const user = userMap.get(workflow.creatorId);
        return {
          ...workflow,
          creator: user ? {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          } : {
            id: 'unknown',
            email: 'deleted-user@example.com',
            firstName: 'Deleted',
            lastName: 'User'
          }
        };
      });

      logger.info(
        { adminId: req.adminUser!.id, workflowCount: workflowsWithCreators.length },
        'Admin fetched all workflows'
      );

      res.json(workflowsWithCreators);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error fetching all workflows');
      res.status(500).json({ message: "Failed to fetch workflows" });
    }
  });

  /**
   * GET /api/admin/workflows/:workflowId
   * Get any workflow (including full details)
   */
  app.get('/api/admin/workflows/:workflowId', hybridAuth, isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const workflow = await workflowRepository.findById(req.params.workflowId);

      if (!workflow) {
        return res.status(404).json({ message: "Workflow not found" });
      }

      logger.info(
        { adminId: req.adminUser!.id, workflowId: req.params.workflowId },
        'Admin fetched workflow details'
      );

      res.json(workflow);
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, workflowId: req.params.workflowId },
        'Error fetching workflow'
      );
      res.status(500).json({ message: "Failed to fetch workflow" });
    }
  });

  /**
   * GET /api/admin/workflows/:workflowId/runs
   * Get all runs for any workflow
   */
  app.get('/api/admin/workflows/:workflowId/runs', hybridAuth, isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const workflow = await workflowRepository.findById(req.params.workflowId);

      if (!workflow) {
        return res.status(404).json({ message: "Workflow not found" });
      }

      const runs = await workflowRunRepository.findByWorkflowId(req.params.workflowId);

      logger.info(
        { adminId: req.adminUser!.id, workflowId: req.params.workflowId, runCount: runs.length },
        'Admin fetched workflow runs'
      );

      res.json(runs);
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, workflowId: req.params.workflowId },
        'Error fetching workflow runs'
      );
      res.status(500).json({ message: "Failed to fetch runs" });
    }
  });

  /**
   * DELETE /api/admin/workflows/:workflowId
   * Delete any workflow
   */
  app.delete('/api/admin/workflows/:workflowId', hybridAuth, isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const workflow = await workflowRepository.findById(req.params.workflowId);

      if (!workflow) {
        return res.status(404).json({ message: "Workflow not found" });
      }

      // Count runs before deletion (they'll be cascade deleted)
      const runs = await workflowRunRepository.findByWorkflowId(req.params.workflowId);
      const runCount = runs.length;

      // Delete the workflow (cascade deletes sections, steps, runs, etc.)
      await workflowRepository.delete(req.params.workflowId);

      logger.warn(
        {
          adminId: req.adminUser!.id,
          workflowId: req.params.workflowId,
          workflowTitle: workflow.title,
          deletedRuns: runCount
        },
        'Admin deleted workflow'
      );

      res.json({ message: "Workflow deleted successfully" });
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, workflowId: req.params.workflowId },
        'Error deleting workflow'
      );
      res.status(500).json({ message: "Failed to delete workflow" });
    }
  });

  // ============================================================================
  // Admin Dashboard Stats
  // ============================================================================

  /**
   * GET /api/admin/stats
   * Get system-wide statistics
   */
  app.get('/api/admin/stats', hybridAuth, isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Fetch stats in parallel for better performance
      const [userStats, workflowStats, runStats] = await Promise.all([
        userRepository.getUserStats(),
        workflowRepository.getWorkflowStats(),
        workflowRunRepository.getRunStats()
      ]);

      const stats = {
        totalUsers: userStats.total,
        adminUsers: userStats.admins,
        creatorUsers: userStats.creators,
        totalWorkflows: workflowStats.total,
        activeWorkflows: workflowStats.active,
        draftWorkflows: workflowStats.draft,
        archivedWorkflows: workflowStats.archived,
        totalRuns: runStats.total,
        completedRuns: runStats.completed,
        inProgressRuns: runStats.inProgress,
      };

      logger.info({ adminId: req.adminUser!.id }, "Admin fetched system stats");

      res.json(stats);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, "Error fetching admin stats");
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
  app.get('/api/admin/logs', hybridAuth, isAdmin, async (req: Request, res: Response) => {
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
  app.get('/api/admin/logs/export', hybridAuth, isAdmin, async (req: Request, res: Response) => {
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
  app.get('/api/admin/logs/events', hybridAuth, isAdmin, async (req: Request, res: Response) => {
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
  app.get('/api/admin/logs/actors', hybridAuth, isAdmin, async (req: Request, res: Response) => {
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

  // =================================================================
  // MFA MANAGEMENT
  // =================================================================

  /**
   * PUT /api/admin/tenants/:tenantId/mfa-required
   * Toggle MFA requirement for a tenant
   */
  app.put('/api/admin/tenants/:tenantId/mfa-required', hybridAuth, isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { tenantId } = req.params;
      const { required } = req.body;

      if (typeof required !== 'boolean') {
        return res.status(400).json({ message: "Required field must be a boolean" });
      }

      // Note: This implementation assumes you have a TenantRepository
      // For now, using raw DB query as a placeholder
      const { db } = await import('../db');
      const { tenants } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      await db.update(tenants)
        .set({ mfaRequired: required })
        .where(eq(tenants.id, tenantId));

      logger.info(
        {
          adminId: req.adminUser!.id,
          tenantId,
          mfaRequired: required
        },
        `Admin ${required ? 'enabled' : 'disabled'} MFA requirement for tenant`
      );

      res.json({
        message: `MFA ${required ? 'enabled' : 'disabled'} for tenant`,
        tenantId,
        mfaRequired: required
      });
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, tenantId: req.params.tenantId },
        'Error updating tenant MFA requirement'
      );
      res.status(500).json({ message: "Failed to update MFA requirement" });
    }
  });
}
