import { z } from 'zod';

import { logger } from '../logger';
import { hybridAuth, getAuthUserTenantId, getAuthUserId } from '../middleware/auth';
import { createLimiter, deleteLimiter } from '../middleware/rateLimiter';
import { datavaultApiTokensService } from '../services/DatavaultApiTokensService';

import type { Express, Request, Response } from 'express';

/**
 * Register DataVault API Token routes
 * Provides token management for external API access to DataVault databases
 */
export function registerDatavaultApiTokenRoutes(app: Express): void {
  // Helper to get tenantId with proper error handling
  const getTenantId = (req: Request): string => {
    const tenantId = getAuthUserTenantId(req);
    if (!tenantId) {
      logger.error(
        {
          userId: getAuthUserId(req),
          path: req.path,
        },
        'User session missing tenantId - user may need to log out and log back in'
      );
      throw new Error(
        'Your account is not properly configured. Please log out and log back in to fix this issue.'
      );
    }
    return tenantId;
  };

  // ===================================================================
  // API TOKEN ENDPOINTS
  // ===================================================================

  /**
   * GET /api/datavault/databases/:databaseId/tokens
   * List all API tokens for a specific database
   * Returns tokens without hash for security
   */
  app.get(
    '/api/datavault/databases/:databaseId/tokens',
    hybridAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const { databaseId } = req.params;

        if (!databaseId) {
          return res.status(400).json({ message: 'Database ID is required' });
        }

        const tokens = await datavaultApiTokensService.getTokensByDatabaseId(
          databaseId,
          tenantId
        );

        res.json({ tokens });
      } catch (error) {
        logger.error({ error, databaseId: req.params.databaseId }, 'Error fetching API tokens');
        const message = error instanceof Error ? error.message : 'Failed to fetch API tokens';
        const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
        res.status(status).json({ message });
      }
    }
  );

  /**
   * POST /api/datavault/databases/:databaseId/tokens
   * Create a new API token for a database
   * Returns the plain token ONCE (never stored or returned again)
   */
  app.post(
    '/api/datavault/databases/:databaseId/tokens',
    createLimiter,
    hybridAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const { databaseId } = req.params;

        if (!databaseId) {
          return res.status(400).json({ message: 'Database ID is required' });
        }

        // Validate request body
        const createSchema = z.object({
          label: z
            .string()
            .min(1, 'Token label is required')
            .max(255, 'Token label is too long (max 255 characters)'),
          scopes: z
            .array(z.enum(['read', 'write']))
            .min(1, 'At least one scope is required'),
          expiresAt: z
            .string()
            .datetime()
            .optional()
            .nullable()
            .transform((val) => (val ? new Date(val) : undefined)),
        });

        const parsed = createSchema.safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({
            message: 'Validation error',
            errors: parsed.error.errors,
          });
        }

        const { label, scopes, expiresAt } = parsed.data;

        // Create token
        const result = await datavaultApiTokensService.createToken(
          databaseId,
          tenantId,
          label,
          scopes,
          expiresAt
        );

        // Return the token record and plain token
        // IMPORTANT: This is the only time the plain token is returned
        res.status(201).json({
          token: {
            id: result.token.id,
            databaseId: result.token.databaseId,
            tenantId: result.token.tenantId,
            label: result.token.label,
            scopes: result.token.scopes,
            createdAt: result.token.createdAt,
            expiresAt: result.token.expiresAt,
          },
          plainToken: result.plainToken,
          message: 'Token created successfully. Save this token now - it will not be shown again.',
        });
      } catch (error) {
        logger.error(
          { error, databaseId: req.params.databaseId },
          'Error creating API token'
        );
        const message = error instanceof Error ? error.message : 'Failed to create API token';
        const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : message.includes('Validation') ? 400 : 500;
        res.status(status).json({ message });
      }
    }
  );

  /**
   * DELETE /api/datavault/tokens/:tokenId
   * Revoke (delete) an API token
   * Requires database ID in body or query for authorization
   */
  app.delete(
    '/api/datavault/tokens/:tokenId',
    deleteLimiter,
    hybridAuth,
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const { tokenId } = req.params;
        const databaseId = (req.body.databaseId || req.query.databaseId) as string;

        if (!tokenId) {
          return res.status(400).json({ message: 'Token ID is required' });
        }

        if (!databaseId) {
          return res.status(400).json({ message: 'Database ID is required' });
        }

        // Delete token
        await datavaultApiTokensService.deleteToken(tokenId, tenantId, databaseId);

        res.json({ message: 'API token revoked successfully' });
      } catch (error) {
        logger.error({ error, tokenId: req.params.tokenId }, 'Error revoking API token');
        const message = error instanceof Error ? error.message : 'Failed to revoke API token';
        const status = message.includes('not found') || message.includes('Access denied') ? 404 : 500;
        res.status(status).json({ message });
      }
    }
  );
}
