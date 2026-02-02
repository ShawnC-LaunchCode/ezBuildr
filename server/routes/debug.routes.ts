import { logger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { workflowRepository } from "../repositories";
import { asyncHandler } from '../utils/asyncHandler';

import type { Express, Request, Response } from "express";

/**
 * Temporary debug routes to diagnose access issues
 */
export function registerDebugRoutes(app: Express): void {
  /**
   * GET /api/debug/workflow/:id
   * Debug workflow access
   */
  app.get('/api/debug/workflow/:id', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      const { id } = req.params;

      logger.info({ userId, workflowId: id }, 'Debug: Checking workflow access');

      const workflow = await workflowRepository.findById(id);

      if (!workflow) {
        res.json({
          found: false,
          message: 'Workflow not found in database',
        });
        return;
      }

      const debug = {
        found: true,
        workflow: {
          id: workflow.id,
          title: workflow.title,
          creatorId: workflow.creatorId,
          ownerId: workflow.ownerId,
          projectId: workflow.projectId,
        },
        currentUser: {
          userId,
          tenantId: authReq.tenantId,
        },
        comparison: {
          creatorIdMatches: workflow.creatorId === userId,
          ownerIdMatches: workflow.ownerId === userId,
          creatorIdType: typeof workflow.creatorId,
          userIdType: typeof userId,
          creatorIdLength: workflow.creatorId?.length,
          userIdLength: userId?.length,
        },
      };

      logger.info(debug, 'Debug: Workflow access details');

      res.json(debug);
    } catch (error) {
      logger.error({ error }, 'Debug: Error checking workflow');
      res.status(500).json({ error: 'Failed to debug workflow' });
    }
  }));

  /**
   * GET /api/debug/me
   * Debug current user
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get('/api/debug/me', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;

    res.json({
      userId: authReq.userId,
      tenantId: authReq.tenantId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- debug route accessing session
      session: (authReq as any).session?.user,
    });
  }));
}
