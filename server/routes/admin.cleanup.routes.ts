/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { logger } from '../logger';
import { isAdmin } from '../middleware/adminAuth';
import { hybridAuth } from '../middleware/auth';
import { placeholderUserCleanupService } from '../services/PlaceholderUserCleanupService';
import { asyncHandler } from '../utils/asyncHandler';

import type { Express, Request, Response } from 'express';

/**
 * Admin Cleanup Routes
 * Provides endpoints for running cleanup jobs
 */
export function registerAdminCleanupRoutes(app: Express): void {
  /**
   * POST /api/admin/cleanup/placeholder-users
   * Clean up placeholder users with no pending invites
   * Admin only
   */
  app.post('/api/admin/cleanup/placeholder-users', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- adminUser is added by isAdmin middleware
      const adminUser = (req as any).adminUser;
      if (!adminUser) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const deletedCount = await placeholderUserCleanupService.cleanupExpiredPlaceholders();

      logger.info({ adminId: adminUser.id, email: adminUser.email, deletedCount }, 'Admin executed placeholder user cleanup');

      res.json({
        message: 'Placeholder user cleanup completed',
        deletedCount,
      });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- adminUser is added by isAdmin middleware
      logger.error({ error, adminId: (req as any).adminUser?.id }, 'Error running placeholder cleanup');
      res.status(500).json({
        message: 'Failed to run placeholder user cleanup',
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  }));

  /**
   * GET /api/admin/cleanup/placeholder-users/stats
   * Get statistics about placeholder users
   * Admin only
   */
  app.get('/api/admin/cleanup/placeholder-users/stats', hybridAuth, isAdmin, asyncHandler(async (req: Request, res: Response) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminUser = (req as any).adminUser;
      if (!adminUser) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const stats = await placeholderUserCleanupService.getPlaceholderStats();

      logger.info({ adminId: adminUser.id, email: adminUser.email }, 'Admin fetched placeholder user stats');

      res.json(stats);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger.error({ error, adminId: (req as any).adminUser?.id }, 'Error getting placeholder stats');
      res.status(500).json({
        message: 'Failed to get placeholder user statistics',
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  }));
}
