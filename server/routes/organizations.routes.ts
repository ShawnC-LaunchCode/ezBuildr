/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { z } from 'zod';

import { logger } from '../logger';
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { organizationService } from '../services/OrganizationService';
import { asyncHandler } from '../utils/asyncHandler';
import { maskSecret } from '../utils/encryption';
import { classifyRouteError } from '../utils/routeErrors';

import type { Express, Request, Response } from 'express';


/**
 * Organization Management Routes
 *
 * Provides endpoints for creating and managing organizations,
 * including membership management and role assignments.
 */

// Validation schemas
const createOrgSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  slug: z.string().optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  slug: z.string().optional(),
});

const createInviteSchema = z.object({
  email: z.string().email(),
});

// eslint-disable-next-line max-lines-per-function
export function registerOrganizationRoutes(app: Express): void {
  /**
   * POST /api/organizations
   * Create a new organization
   * Auto-creates admin membership for creator
   */
  app.post('/api/organizations', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        // eslint-disable-next-line sonarjs/no-duplicate-string
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const data = createOrgSchema.parse(req.body);
      const organization = await organizationService.createOrganization(data, userId);

      logger.info({ orgId: organization.id, userId }, 'Organization created');
      res.status(201).json(organization);
    } catch (error) {
      logger.error({ error, userId: (req as AuthRequest).userId }, 'Error creating organization');
      const { status, message } = classifyRouteError(error, 'Failed to create organization');
      res.status(status).json({ message: message });
    }
  }));

  /**
   * GET /api/organizations
   * Get all organizations for the authenticated user
   */
  app.get('/api/organizations', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const organizations = await organizationService.getUserOrganizations(userId);
      res.json(organizations);
    } catch (error) {
      logger.error({ error, userId: (req as AuthRequest).userId }, 'Error fetching organizations');
      res.status(500).json({ message: 'Failed to fetch organizations' });
    }
  }));

  /**
   * GET /api/organizations/:orgId
   * Get organization details
   * Requires membership
   */
  app.get('/api/organizations/:orgId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { orgId } = req.params;
      const organization = await organizationService.getOrganizationById(orgId, userId);
      res.json(organization);
    } catch (error) {
      logger.error(
        { error, orgId: req.params.orgId, userId: (req as AuthRequest).userId },
        'Error fetching organization'
      );
      const { status, message } = classifyRouteError(error, 'Failed to fetch organization');
      res.status(status).json({ message });
    }
  }));

  /**
   * PATCH /api/organizations/:orgId
   * Update organization (admin only)
   */
  app.patch('/api/organizations/:orgId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { orgId } = req.params;
      const data = updateOrgSchema.parse(req.body);
      const organization = await organizationService.updateOrganization(orgId, userId, data);

      logger.info({ orgId, userId }, 'Organization updated');
      res.json(organization);
    } catch (error) {
      logger.error(
        { error, orgId: req.params.orgId, userId: (req as AuthRequest).userId },
        'Error updating organization'
      );
      const { status, message } = classifyRouteError(error, 'Failed to update organization');
      res.status(status).json({ message: message });
    }
  }));

  /**
   * GET /api/organizations/:orgId/members
   * Get organization members
   * Requires membership
   */
  app.get('/api/organizations/:orgId/members', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { orgId } = req.params;
      const members = await organizationService.getOrganizationMembers(orgId, userId);
      res.json(members);
    } catch (error) {
      logger.error(
        { error, orgId: req.params.orgId, userId: (req as AuthRequest).userId },
        'Error fetching organization members'
      );
      const { status, message } = classifyRouteError(error, 'Failed to fetch members');
      res.status(status).json({ message: message });
    }
  }));

  /**
   * POST /api/organizations/:orgId/members/:targetUserId/promote
   * Promote member to admin (admin only)
   */
  app.post(
    '/api/organizations/:orgId/members/:targetUserId/promote',
    hybridAuth,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const userId = (req as AuthRequest).userId;
        if (!userId) {
          return res.status(401).json({ message: 'Unauthorized - no user ID' });
        }

        const { orgId, targetUserId } = req.params;
        await organizationService.promoteMember(orgId, targetUserId, userId);

        logger.info({ orgId, targetUserId, adminUserId: userId }, 'Member promoted to admin');
        res.json({ message: 'Member promoted to admin successfully' });
      } catch (error) {
        logger.error(
          {
            error,
            orgId: req.params.orgId,
            targetUserId: req.params.targetUserId,
            userId: (req as AuthRequest).userId,
          },
          'Error promoting member'
        );
        const { status, message } = classifyRouteError(error, 'Failed to promote member');
      res.status(status).json({ message: message });
      }
    })
  );

  /**
   * POST /api/organizations/:orgId/members/:targetUserId/demote
   * Demote admin to member (admin only)
   */
  app.post(
    '/api/organizations/:orgId/members/:targetUserId/demote',
    hybridAuth,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const userId = (req as AuthRequest).userId;
        if (!userId) {
          return res.status(401).json({ message: 'Unauthorized - no user ID' });
        }

        const { orgId, targetUserId } = req.params;
        await organizationService.demoteMember(orgId, targetUserId, userId);

        logger.info({ orgId, targetUserId, adminUserId: userId }, 'Admin demoted to member');
        res.json({ message: 'Admin demoted to member successfully' });
      } catch (error) {
        logger.error(
          {
            error,
            orgId: req.params.orgId,
            targetUserId: req.params.targetUserId,
            userId: (req as AuthRequest).userId,
          },
          'Error demoting member'
        );
        const { status, message } = classifyRouteError(error, 'Failed to demote member');
      res.status(status).json({ message: message });
      }
    })
  );

  /**
   * DELETE /api/organizations/:orgId/members/:targetUserId
   * Remove member from organization (admin only)
   */
  app.delete(
    '/api/organizations/:orgId/members/:targetUserId',
    hybridAuth,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const userId = (req as AuthRequest).userId;
        if (!userId) {
          return res.status(401).json({ message: 'Unauthorized - no user ID' });
        }

        const { orgId, targetUserId } = req.params;
        await organizationService.removeMember(orgId, targetUserId, userId);

        logger.info({ orgId, targetUserId, adminUserId: userId }, 'Member removed from organization');
        res.json({ message: 'Member removed successfully' });
      } catch (error) {
        logger.error(
          {
            error,
            orgId: req.params.orgId,
            targetUserId: req.params.targetUserId,
            userId: (req as AuthRequest).userId,
          },
          'Error removing member'
        );
        const { status, message } = classifyRouteError(error, 'Failed to remove member');
      res.status(status).json({ message: message });
      }
    })
  );

  /**
   * POST /api/organizations/:orgId/leave
   * Leave organization (any member can remove themselves)
   */
  app.post('/api/organizations/:orgId/leave', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { orgId } = req.params;
      await organizationService.leaveOrganization(orgId, userId);

      logger.info({ orgId, userId }, 'User left organization');
      res.json({ message: 'Successfully left organization' });
    } catch (error) {
      logger.error(
        { error, orgId: req.params.orgId, userId: (req as AuthRequest).userId },
        'Error leaving organization'
      );
      const { status, message } = classifyRouteError(error, 'Failed to leave organization');
      res.status(status).json({ message: message });
    }
  }));

  /**
   * POST /api/organizations/:orgId/members
   * Add member to organization (admin only)
   */
  app.post('/api/organizations/:orgId/members', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { orgId } = req.params;
      const { userId: targetUserId, role = 'member' } = req.body;

      if (!targetUserId) {
        return res.status(400).json({ message: 'userId is required' });
      }

      if (role !== 'admin' && role !== 'member') {
        return res.status(400).json({ message: 'Invalid role' });
      }

      await organizationService.addMember(orgId, targetUserId, userId, role);

      logger.info({ orgId, targetUserId, role, adminUserId: userId }, 'Member added to organization');
      res.status(201).json({ message: 'Member added successfully' });
    } catch (error) {
      logger.error(
        { error, orgId: req.params.orgId, userId: (req as AuthRequest).userId },
        'Error adding member'
      );
      const { status, message } = classifyRouteError(error, 'Failed to add member');
      res.status(status).json({ message: message });
    }
  }));

  /**
   * POST /api/organizations/:orgId/invites
   * Create organization invite by email (admin only)
   */
  app.post('/api/organizations/:orgId/invites', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { orgId } = req.params;
      const { email } = createInviteSchema.parse(req.body);

      const result = await organizationService.createInvite(orgId, email, userId);

      logger.info({ orgId, email, adminUserId: userId }, 'Organization invite created');
      res.status(201).json({
        message: 'Invite sent successfully',
        inviteId: result.inviteId,
      });
    } catch (error) {
      logger.error(
        { error, orgId: req.params.orgId, userId: (req as AuthRequest).userId },
        'Error creating invite'
      );
      const { status, message } = classifyRouteError(error, 'Failed to create invite');
      res.status(status).json({ message: message });
    }
  }));

  /**
   * GET /api/organizations/:orgId/invites
   * Get organization invites (admin only)
   */
  app.get('/api/organizations/:orgId/invites', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { orgId } = req.params;
      const invites = await organizationService.getOrganizationInvites(orgId, userId);

      res.json(invites);
    } catch (error) {
      logger.error(
        { error, orgId: req.params.orgId, userId: (req as AuthRequest).userId },
        'Error fetching invites'
      );
      const { status, message } = classifyRouteError(error, 'Failed to fetch invites');
      res.status(status).json({ message: message });
    }
  }));

  /**
   * GET /api/me/invites
   * Get pending invites for current user
   */
  app.get('/api/me/invites', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const invites = await organizationService.getPendingInvitesForUser(userId);
      res.json(invites);
    } catch (error) {
      logger.error({ error, userId: (req as AuthRequest).userId }, 'Error fetching user invites');
      res.status(500).json({ message: 'Failed to fetch invites' });
    }
  }));

  /**
   * POST /api/invites/:token/accept
   * Accept organization invite
   */
  app.post('/api/invites/:token/accept', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { token } = req.params;
      const result = await organizationService.acceptInvite(token, userId);

      logger.info({ token: maskSecret(token), userId, orgId: result.orgId }, 'Invite accepted');
      res.json({
        message: `Successfully joined ${result.orgName}`,
        orgId: result.orgId,
        orgName: result.orgName,
      });
    } catch (error) {
      logger.error({ error, token: maskSecret(req.params.token), userId: (req as AuthRequest).userId }, 'Error accepting invite');
      const { status, message } = classifyRouteError(error, 'Failed to accept invite');
      res.status(status).json({ message: message });
    }
  }));

  /**
   * DELETE /api/organizations/:orgId/invites/:inviteId
   * Revoke organization invite (admin only)
   */
  app.delete(
    '/api/organizations/:orgId/invites/:inviteId',
    hybridAuth,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const userId = (req as AuthRequest).userId;
        if (!userId) {
          return res.status(401).json({ message: 'Unauthorized - no user ID' });
        }

        const { inviteId } = req.params;
        await organizationService.revokeInvite(inviteId, userId);

        logger.info({ inviteId, adminUserId: userId }, 'Invite revoked');
        res.json({ message: 'Invite revoked successfully' });
      } catch (error) {
        logger.error(
          { error, inviteId: req.params.inviteId, userId: (req as AuthRequest).userId },
          'Error revoking invite'
        );
        const { status, message } = classifyRouteError(error, 'Failed to revoke invite');
      res.status(status).json({ message: message });
      }
    })
  );

  /**
   * DELETE /api/organizations/:orgId
   * Delete organization (admin only)
   * FIX #7: Prevent stuck state for last admin
   */
  app.delete('/api/organizations/:orgId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { orgId } = req.params;
      await organizationService.deleteOrganization(orgId, userId);

      logger.info({ orgId, userId }, 'Organization deleted');
      res.json({ message: 'Organization deleted successfully' });
    } catch (error) {
      logger.error(
        { error, orgId: req.params.orgId, userId: (req as AuthRequest).userId },
        'Error deleting organization'
      );
      const { status, message } = classifyRouteError(error, 'Failed to delete organization');
      res.status(status).json({ message: message });
    }
  }));
}
