import { z } from "zod";

import { createLogger } from "../logger";
import { isAdmin } from "../middleware/adminAuth";
import { hybridAuth } from "../middleware/auth";
import { invalidateUserCache } from "../middleware/userCache";
import { userRepository } from "../repositories/UserRepository";
import { authService } from "../services/AuthService";
import { WorkflowRepository } from "../repositories/WorkflowRepository";
import { WorkflowRunRepository } from "../repositories/WorkflowRunRepository";
import { accountLockoutService } from "../services/AccountLockoutService";
import { ActivityLogService } from "../services/ActivityLogService";
import { adminAccessService } from "../services/AdminAccessService";
import { adminUserService } from "../services/AdminUserService";
import { adminOrgStatsService } from "../services/AdminOrgStatsService";
import { mfaService } from "../services/MfaService";
import { workflowClonerService } from "../services/WorkflowClonerService";
import { asyncHandler } from "../utils/asyncHandler";
import { classifyRouteError } from "../utils/routeErrors";

import type { Express, Request, Response } from "express";

const logger = createLogger({ module: 'admin-routes' });
const activityLogService = new ActivityLogService();

/**
 * The admin copy always targets the acting admin's own account, so ownership
 * fields are deliberately not accepted from the client.
 */
const adminCopyWorkflowBodySchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  includeDatavaultData: z.boolean().optional().default(false),
});

/**
 * Register admin-only routes
 * These routes require admin role for access
 *
 * NOTE: Refactored from survey-based to workflow-based (Nov 2025)
 */
// eslint-disable-next-line max-lines-per-function
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
  app.get('/api/admin/users', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // RLS-6: cross-tenant by nature (listing every user IS the feature) —
      // goes through the admin-only BYPASSRLS path, audited.
      const usersWithStats = await adminAccessService.listAllUsersWithWorkflowCounts(req.adminUser.id, req.id);

      logger.info(
        { adminId: req.adminUser.id, userCount: usersWithStats.length },
        'Admin fetched all users'
      );

      res.json(usersWithStats);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error fetching all users');
      res.status(500).json({ message: "Failed to fetch users" });
    }
  }));

  /**
   * PUT /api/admin/users/:userId/active
   * Update user active status (deactivate/activate)
   */
  app.put('/api/admin/users/:userId/active', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { userId } = req.params;
      const { isActive } = req.body as { isActive: boolean };

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }

      // Prevent deactivating oneself
      if (userId === req.adminUser.id && !isActive) {
        return res.status(400).json({ message: "You cannot deactivate your own account" });
      }

      const updatedUser = await userRepository.updateIsActive(userId, isActive);
      invalidateUserCache(userId);
      
      if (!isActive) {
          await authService.revokeAllUserTokens(userId);
      }

      logger.info(
        { adminId: req.adminUser.id, targetUserId: userId, isActive },
        `Admin ${isActive ? 'activated' : 'deactivated'} user`
      );

      res.json({ message: `User ${isActive ? 'activated' : 'deactivated'} successfully`, user: updatedUser });
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error updating user active status');
      res.status(500).json({ message: "Failed to update user active status" });
    }
  }));

  /**
   * DELETE /api/admin/users/:userId
   * Delete a user permanently
   */
  app.delete('/api/admin/users/:userId', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { userId } = req.params;

      // Prevent deleting oneself
      if (userId === req.adminUser.id) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }

      await adminUserService.deleteUser(userId);
      invalidateUserCache(userId);

      logger.info(
        { adminId: req.adminUser.id, targetUserId: userId },
        'Admin deleted user'
      );

      res.json({ message: "User deleted successfully" });
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error deleting user');
      const { status, message } = classifyRouteError(
        error,
        "Failed to delete user. They may have dependent data that prevents deletion."
      );
      res.status(status).json({ message });
    }
  }));

  /**
   * PUT /api/admin/users/:userId/role
   * Update user role (promote/demote admin)
   */
  app.put('/api/admin/users/:userId/role', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { userId } = req.params;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { role } = req.body;

      if (!role || (role !== 'admin' && role !== 'creator')) {
        return res.status(400).json({
          message: "Invalid role. Must be 'admin' or 'creator'"
        });
      }

      // Prevent self-demotion
      if (userId === req.adminUser.id && role === 'creator') {
        return res.status(400).json({
          message: "You cannot demote yourself from admin"
        });
      }

      // Critical: Prevent demoting the last admin. Cross-tenant by nature —
      // "the last admin" means across every tenant, not just the acting
      // admin's own — so this goes through the admin-only BYPASSRLS path.
      if (role === 'creator') {
        const allUsers = await adminAccessService.listAllUsers(req.adminUser.id, req.id);
        const adminCount = allUsers.filter(u => u.role === 'admin').length;

        // Check if the user being demoted is currently an admin
        const targetUser = allUsers.find(u => u.id === userId);
        if (targetUser?.role === 'admin' && adminCount <= 1) {
          return res.status(400).json({
            message: "Cannot demote the last admin. Promote another user to admin first."
          });
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const updatedUser = await userRepository.updateRole(userId, role);

      // SECURITY: apply the system-role change immediately — drop the cached user (so JWT auth
      // re-hydrates the new role at once) and revoke refresh tokens (so the session cannot be
      // refreshed under the old role).
      invalidateUserCache(userId);
      await authService.revokeAllUserTokens(userId);

      logger.info(
        {
          adminId: req.adminUser.id,
          targetUserId: userId,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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

      // eslint-disable-next-line sonarjs/no-duplicate-string
      if (error instanceof Error && error.message === 'User not found') {
        return res.status(404).json({ message: "User not found" });
      }

      res.status(500).json({ message: "Failed to update user role" });
    }
  }));

  /**
   * POST /api/admin/users/:userId/unlock
   * Unlock a locked user account
   */
  app.post('/api/admin/users/:userId/unlock', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
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
          adminId: req.adminUser.id,
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
  }));

  /**
   * POST /api/admin/users/:userId/reset-mfa
   * Reset MFA for a user (for locked out users)
   */
  app.post('/api/admin/users/:userId/reset-mfa', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
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
          adminId: req.adminUser.id,
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
  }));

  /**
   * GET /api/admin/users/:userId/workflows
   * Get all workflows for a specific user
   */
  app.get('/api/admin/users/:userId/workflows', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
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

      // RLS-6: the target user may be in a different tenant than the acting
      // admin — goes through the admin-only BYPASSRLS path, audited.
      const workflows = await adminAccessService.listWorkflowsForUser(req.adminUser.id, userId, req.id);
      const runCounts = await workflowRunRepository.countByWorkflowIds(workflows.map(w => w.id));

      logger.info(
        { adminId: req.adminUser.id, targetUserId: userId, workflowCount: workflows.length },
        'Admin fetched user workflows'
      );

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        workflows: workflows.map(workflow => ({
          ...workflow,
          runCount: runCounts.get(workflow.id) ?? 0,
        })),
      });
    } catch (error) {
      logger.error(
        { err: error, adminId: req.adminUser!.id, userId: req.params.userId },
        'Error fetching user workflows'
      );
      res.status(500).json({ message: "Failed to fetch user workflows" });
    }
  }));

  /**
   * POST /api/admin/users/invite
   * Invite a new user
   */
  app.post('/api/admin/users/invite', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { email, role } = req.body as { email: string, role: string };

      if (!email || !role) {
        return res.status(400).json({ message: "Email and role are required" });
      }

      if (role !== 'admin' && role !== 'creator') {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Check if user already exists
      const existingUser = await userRepository.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists with this email" });
      }

      // Create placeholder user
      const { v4: uuidv4 } = await import('uuid');
      const userId = uuidv4();
      
      const user = await userRepository.create({
        id: userId,
        email,
        placeholderEmail: email,
        isPlaceholder: true,
        role: role,
        authProvider: 'local',
        defaultMode: 'easy',
      });

      // We need a dummy passwordHash for the userCredentials record since it's required
      const { authService } = await import('../services/AuthService');
      const crypto = await import('crypto');
      const dummyPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await authService.hashPassword(dummyPassword);
      const { userCredentialsRepository } = await import('../repositories');
      await userCredentialsRepository.createCredentials(userId, passwordHash);

      // Generate and send invite
      await authService.generateSystemInviteToken(email, role);

      logger.info({ adminId: req.adminUser.id, targetEmail: email }, 'Admin invited new user');

      // Log to Admin Logs asynchronously
      activityLogService.log('User Invited', {
        actorId: req.adminUser.id,
        actorEmail: req.adminUser.email,
        entityType: 'user',
        entityId: userId,
        metadata: { targetEmail: email, role }
      }).catch((e: unknown) => logger.error({err: e}, 'Failed to log User Invited activity'));

      res.status(201).json({
        message: "User invited successfully",
        user
      });
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error inviting user');
      res.status(500).json({ message: "Failed to invite user" });
    }
  }));

  /**
   * POST /api/admin/users/:userId/resend-invite
   * Resend invitation to a placeholder user
   */
  app.post('/api/admin/users/:userId/resend-invite', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { userId } = req.params;
      const user = await userRepository.findById(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.isPlaceholder) {
        return res.status(400).json({ message: "User has already accepted their invitation" });
      }

      const { authService } = await import('../services/AuthService');
      await authService.generateSystemInviteToken(user.email, user.role as string);

      logger.info({ adminId: req.adminUser.id, targetUserId: userId }, 'Admin resent invitation');

      // Log to Admin Logs asynchronously
      activityLogService.log('Invite Resent', {
        actorId: req.adminUser.id,
        actorEmail: req.adminUser.email,
        entityType: 'user',
        entityId: userId,
        metadata: { targetEmail: user.email, role: user.role }
      }).catch((e: unknown) => logger.error({err: e}, 'Failed to log Invite Resent activity'));

      res.json({ message: "Invitation resent successfully" });
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error resending invitation');
      res.status(500).json({ message: "Failed to resend invitation" });
    }
  }));

  // ============================================================================
  // Workflow Management (Admin can view/edit any workflow)
  // ============================================================================

  /**
   * GET /api/admin/workflows
   * Get all workflows in the system
   */
  app.get('/api/admin/workflows', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get all users first (for mapping creators). Cross-tenant by nature —
      // goes through the admin-only BYPASSRLS path, audited.
      const users = await adminAccessService.listAllUsers(req.adminUser.id, req.id);
      const userMap = new Map(users.map(u => [u.id, u]));

      // Get all workflows directly
      const allWorkflows = await workflowRepository.findAll();

      const workflowsWithCreators = allWorkflows.map((workflow) => {
        const user = workflow.creatorId ? userMap.get(workflow.creatorId) : null;
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
        { adminId: req.adminUser.id, workflowCount: workflowsWithCreators.length },
        'Admin fetched all workflows'
      );

      res.json(workflowsWithCreators);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error fetching all workflows');
      res.status(500).json({ message: "Failed to fetch workflows" });
    }
  }));

  /**
   * GET /api/admin/workflows/:workflowId
   * Get any workflow (including full details)
   */
  app.get('/api/admin/workflows/:workflowId', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const workflow = await workflowRepository.findById(req.params.workflowId);

      if (!workflow) {
        return res.status(404).json({ message: "Workflow not found" });
      }

      logger.info(
        { adminId: req.adminUser.id, workflowId: req.params.workflowId },
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
  }));

  /**
   * GET /api/admin/workflows/:workflowId/runs
   * Get all runs for any workflow
   */
  app.get('/api/admin/workflows/:workflowId/runs', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
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
        { adminId: req.adminUser.id, workflowId: req.params.workflowId, runCount: runs.length },
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
  }));

  /**
   * POST /api/admin/workflows/:workflowId/copy
   * Copy any workflow into the acting admin's own account. Exists so an admin
   * can salvage a departing user's work before deleting their workflows (and
   * then the user) — the normal /api/workflows/:id/copy route requires an ACL
   * grant on the source, which an admin does not have.
   */
  app.post('/api/admin/workflows/:workflowId/copy', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const options = adminCopyWorkflowBodySchema.parse(req.body);

      const result = await workflowClonerService.copyWorkflowAsAdmin(
        req.params.workflowId,
        req.adminUser.id,
        {
          name: options.name,
          includeRelatedDatavault: true,
          includeDatavaultData: options.includeDatavaultData,
          clearAccess: true,
        }
      );

      logger.warn(
        {
          adminId: req.adminUser.id,
          sourceWorkflowId: req.params.workflowId,
          copyWorkflowId: result.workflow?.id,
          includeDatavaultData: options.includeDatavaultData,
        },
        'Admin copied workflow to their own account'
      );

      res.status(201).json({
        message: "Workflow copied successfully",
        workflow: result.workflow,
        copiedDatabases: result.copiedDatabases,
        copiedTables: result.copiedTables,
        copiedRows: result.copiedRows,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      logger.error(
        { err: error, adminId: req.adminUser!.id, workflowId: req.params.workflowId },
        'Error copying workflow as admin'
      );
      const { status, message } = classifyRouteError(error, "Failed to copy workflow");
      res.status(status).json({ message });
    }
  }));

  /**
   * DELETE /api/admin/workflows/:workflowId
   * Delete any workflow
   */
  app.delete('/api/admin/workflows/:workflowId', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
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
          adminId: req.adminUser.id,
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
  }));

  // ============================================================================
  // Admin Dashboard Stats
  // ============================================================================

  /**
   * GET /api/admin/stats
   * Get system-wide statistics
   */
  app.get('/api/admin/stats', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
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

      logger.info({ adminId: req.adminUser.id }, "Admin fetched system stats");

      res.json(stats);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, "Error fetching admin stats");
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  }));

  /**
   * GET /api/admin/org-stats
   * Get organization-level usage, storage, and run statistics
   */
  app.get('/api/admin/org-stats', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const stats = await adminOrgStatsService.getOrgStats(req.adminUser);

      logger.info(
        { adminId: req.adminUser.id, orgCount: stats.organizations.length },
        "Admin fetched organization stats"
      );

      res.json(stats);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser?.id }, "Error fetching organization stats");
      const { status, message } = classifyRouteError(error, "Failed to fetch organization statistics");
      res.status(status).json({ message });
    }
  }));

  // ============================================================================
  // Activity Logs
  // ============================================================================

  /**
   * GET /api/admin/logs
   * Get activity logs with filtering and pagination
   */
  app.get('/api/admin/logs', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
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
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        limit: req.query.limit ? Number(req.query.limit) : 50,
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        offset: req.query.offset ? Number(req.query.offset) : 0,
        sort: (req.query.sort as string) || "timestamp_desc",
      };

      const result = await activityLogService.list(query);

      logger.info(
        {
          adminId: req.adminUser.id,
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
  }));

  /**
   * GET /api/admin/logs/export
   * Export activity logs to CSV
   */
  app.get('/api/admin/logs/export', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
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

      if (!query.from || !query.to) {
        return res.status(400).json({ error: "Missing required date boundaries", message: "Date boundaries 'from' and 'to' are required for exports." });
      }

      const { filename, csv } = await activityLogService.exportCsv(query);

      logger.info(
        { adminId: req.adminUser.id, query, filename },
        'Admin exported activity logs to CSV'
      );

      res.setHeader("Content-Type", "text/csv");
      const encodedFilename = encodeURIComponent(filename);
      // SEC-009: RFC 6266 encoding for attachment filename
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
      res.send(csv);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error exporting activity logs');
      res.status(500).json({ message: "Failed to export activity logs" });
    }
  }));

  /**
   * GET /api/admin/logs/events
   * Get unique event types for filter dropdowns
   */
  app.get('/api/admin/logs/events', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const events = await activityLogService.getUniqueEvents();

      logger.info(
        { adminId: req.adminUser.id, eventCount: events.length },
        'Admin fetched unique event types'
      );

      res.json(events);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error fetching event types');
      res.status(500).json({ message: "Failed to fetch event types" });
    }
  }));

  /**
   * GET /api/admin/logs/actors
   * Get unique actors for filter dropdowns
   */
  app.get('/api/admin/logs/actors', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const actors = await activityLogService.getUniqueActors();

      logger.info(
        { adminId: req.adminUser.id, actorCount: actors.length },
        'Admin fetched unique actors'
      );

      res.json(actors);
    } catch (error) {
      logger.error({ err: error, adminId: req.adminUser!.id }, 'Error fetching actors');
      res.status(500).json({ message: "Failed to fetch actors" });
    }
  }));

  // =================================================================
  // MFA MANAGEMENT
  // =================================================================

  /**
   * PUT /api/admin/tenants/:tenantId/mfa-required
   * Toggle MFA requirement for a tenant
   */
  app.put('/api/admin/tenants/:tenantId/mfa-required', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.adminUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { tenantId } = req.params;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
          adminId: req.adminUser.id,
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
  }));
}

