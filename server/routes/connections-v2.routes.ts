/**
 * Connections API Routes (Stage 16 - Integrations Hub)
 * Manages unified integration connections with OAuth2 3-legged flow support
 * RBAC: Owner/Builder can manage connections; Runner/Viewer have read-only access
 */

import { z } from 'zod';

import { logger } from '../logger';
import { requireProjectRole } from '../middleware/aclAuth';
import { hybridAuth } from '../middleware/auth';
import { aclService } from '../services/AclService';
import { createConnection, deleteConnection, getConnection, listConnections, testConnection, updateConnection, getConnectionById, initiateOAuth2Flow, handleOAuth2Callback, getConnectionStatus } from '../services/connections';
import type { CreateConnectionInput, UpdateConnectionInput } from '@shared/types/connections';
import { validateSafeUrl } from '../utils/ssrfValidator';
import {
  validateOAuth2State,
  cleanupOAuth2State,
} from '../services/oauth2';
import { asyncHandler } from '../utils/asyncHandler';


import type { Express, Request, Response } from 'express';

/**
 * Escape a string for safe interpolation into HTML text/attribute context.
 * Prevents reflected/stored XSS in the OAuth callback pages below.
 */
function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validation schemas
 */
const createConnectionSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['api_key', 'bearer', 'oauth2_client_credentials', 'oauth2_3leg']),
  baseUrl: z.string().url('baseUrl must be a valid URL').optional(),
  authConfig: z.record(z.any()),
  secretRefs: z.record(z.string()),
  defaultHeaders: z.record(z.string()).optional().refine(headers => {
      return headers === undefined || !Object.keys(headers).some(k => k.toLowerCase() === 'authorization');
  }, "Authorization header not allowed in defaultHeaders"),
  timeoutMs: z.number().int().min(100).max(60000).optional(),
  retries: z.number().int().min(0).max(10).optional(),
  backoffMs: z.number().int().min(0).max(5000).optional(),
});

const updateConnectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  baseUrl: z.string().url().optional(),
  authConfig: z.record(z.any()).optional(),
  secretRefs: z.record(z.string()).optional(),
  defaultHeaders: z.record(z.string()).optional().refine(headers => {
      return headers === undefined || !Object.keys(headers).some(k => k.toLowerCase() === 'authorization');
  }, "Authorization header not allowed in defaultHeaders"),
  timeoutMs: z.number().int().min(100).max(60000).optional(),
  retries: z.number().int().min(0).max(10).optional(),
  backoffMs: z.number().int().min(0).max(5000).optional(),
  enabled: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

/**
 * Register connections routes
 */

export function registerConnectionsV2Routes(app: Express): void {
  /**
   * GET /api/projects/:projectId/connections
   * List all connections for a project
   */
  app.get('/api/projects/:projectId/connections', hybridAuth, requireProjectRole('view'), asyncHandler(async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;

      // List connections
      const connections = await listConnections(projectId);

      res.json(connections);
    } catch (error) {
      logger.error({ error }, 'Failed to list connections:');
      res.status(500).json({
        error: 'Failed to list connections',
      });
    }
  }));

  /**
   * GET /api/projects/:projectId/connections/:connectionId
   * Get a specific connection
   */
  app.get('/api/projects/:projectId/connections/:connectionId', hybridAuth, requireProjectRole('view'), asyncHandler(async (req: Request, res: Response) => {
    try {
      const { projectId, connectionId } = req.params;

      const connection = await getConnection(projectId, connectionId);

      if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      res.json(connection);
    } catch (error) {
      logger.error({ error }, 'Failed to get connection:');
      res.status(500).json({
        error: 'Failed to get connection',
      });
    }
  }));

  /**
   * POST /api/projects/:projectId/connections
   * Create a new connection
   */
  app.post('/api/projects/:projectId/connections', hybridAuth, requireProjectRole('edit'), asyncHandler(async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;

      // Validate input
      const validatedData = await createConnectionSchema.parseAsync(req.body);
      
      if (validatedData.baseUrl) {
          const isSafe = await validateSafeUrl(validatedData.baseUrl);
          if (!isSafe) {
              return res.status(400).json({ error: "Invalid or unsafe baseUrl" });
          }
      }

      const input: CreateConnectionInput = {
        projectId,
        ...validatedData,
      };

      // Create connection
      const connection = await createConnection(input);

      logger.info({
        connectionId: connection.id,
        projectId,
        name: connection.name,
        type: connection.type,
      }, 'Connection created:');

      res.status(201).json(connection);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
        return;
      }

      logger.error({ error }, 'Failed to create connection:');
      res.status(500).json({
        error: 'Failed to create connection',
      });
    }
  }));

  /**
   * PATCH /api/projects/:projectId/connections/:connectionId
   * Update a connection
   */
  app.patch('/api/projects/:projectId/connections/:connectionId', hybridAuth, requireProjectRole('edit'), asyncHandler(async (req: Request, res: Response) => {
    try {
      const { projectId, connectionId } = req.params;

      // Validate input
      const validatedData = await updateConnectionSchema.parseAsync(req.body);
      
      if (validatedData.baseUrl) {
          const isSafe = await validateSafeUrl(validatedData.baseUrl);
          if (!isSafe) {
              return res.status(400).json({ error: "Invalid or unsafe baseUrl" });
          }
      }

      const input: UpdateConnectionInput = validatedData;

      // Update connection
      const connection = await updateConnection(projectId, connectionId, input);

      logger.info({
        connectionId: connection.id,
        projectId,
        name: connection.name,
      }, 'Connection updated:');

      res.json(connection);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
        return;
      }

      logger.error({ error }, 'Failed to update connection:');
      res.status(500).json({
        error: 'Failed to update connection',
      });
    }
  }));

  /**
   * DELETE /api/projects/:projectId/connections/:connectionId
   * Delete a connection
   */
  app.delete('/api/projects/:projectId/connections/:connectionId', hybridAuth, requireProjectRole('edit'), asyncHandler(async (req: Request, res: Response) => {
    try {
      const { projectId, connectionId } = req.params;

      await deleteConnection(projectId, connectionId);

      logger.info({
        connectionId,
        projectId,
      }, 'Connection deleted:');

      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Failed to delete connection:');
      res.status(500).json({
        error: 'Failed to delete connection',
      });
    }
  }));

  /**
   * POST /api/projects/:projectId/connections/:connectionId/test
   * Test a connection
   */
  app.post('/api/projects/:projectId/connections/:connectionId/test', hybridAuth, requireProjectRole('edit'), asyncHandler(async (req: Request, res: Response) => {
    try {
      const { projectId, connectionId } = req.params;

      const result = await testConnection(projectId, connectionId);

      logger.info({
        connectionId,
        projectId,
        success: result.success,
        statusCode: result.statusCode,
      }, 'Connection tested:');

      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Failed to test connection:');
      res.status(500).json({
        error: 'Failed to test connection',
      });
    }
  }));

  /**
   * GET /api/projects/:projectId/connections/:connectionId/status
   * Get connection status (for UI display)
   */
  app.get('/api/projects/:projectId/connections/:connectionId/status', hybridAuth, requireProjectRole('view'), asyncHandler(async (req: Request, res: Response) => {
    try {
      const { projectId, connectionId } = req.params;

      const status = await getConnectionStatus(projectId, connectionId);

      res.json(status);
    } catch (error) {
      logger.error({ error }, 'Failed to get connection status:');
      res.status(500).json({
        error: 'Failed to get connection status',
      });
    }
  }));

  /**
   * GET /api/connections/oauth/start
   * Initiate OAuth2 3-legged authorization flow
   */
  app.get('/api/connections/oauth/start', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { connectionId, projectId } = req.query;

      if (connectionId === undefined || typeof connectionId !== 'string') {
        res.status(400).json({ error: 'connectionId query parameter is required' });
        return;
      }

      if (projectId === undefined || typeof projectId !== 'string') {
        res.status(400).json({ error: 'projectId query parameter is required' });
        return;
      }

      // SECURITY: projectId arrives via query string here, so requireProjectRole (which reads
      // route params) cannot guard this route. Enforce project access manually.
      const userId = (req as { userId?: string }).userId;
      if (!userId || !(await aclService.hasProjectRole(userId, projectId, 'edit'))) {
        res.status(403).json({ error: 'Forbidden - edit access to this project is required' });
        return;
      }

      // Get base URL from environment or request
      const protocol = req.secure ? 'https' : 'http';
      const host = req.get('host');
      const baseUrl = process.env.BASE_URL ?? `${protocol}://${host ?? 'localhost'}`;

      const result = await initiateOAuth2Flow(projectId, connectionId, baseUrl);

      logger.info({
        connectionId,
        projectId,
        state: result.state,
      }, 'OAuth2 flow initiated:');

      // Redirect user to authorization URL
      res.redirect(result.authorizationUrl);
    } catch (error) {
      logger.error({ error }, 'Failed to initiate OAuth2 flow:');
      res.status(500).json({
        error: 'Failed to initiate OAuth2 flow',
      });
    }
  }));

  /**
   * GET /api/connections/oauth/callback
   * Handle OAuth2 callback
   */
  app.get('/api/connections/oauth/callback', asyncHandler(async (req: Request, res: Response) => {
    try {
      const { code, state, error: oauthError } = req.query;

      // Check for OAuth error
      if (oauthError !== undefined) {
        logger.error({ error: oauthError }, 'OAuth2 callback error:');
        res.status(400).send(`
          <html>
            <body>
              <h1>Authorization Failed</h1>
              <p>Error: ${escapeHtml(oauthError)}</p>
              <p><a href="/">Return to Dashboard</a></p>
            </body>
          </html>
        `);
        return;
      }

      // Validate parameters
      if (code === undefined || typeof code !== 'string' || state === undefined || typeof state !== 'string') {
        res.status(400).json({ error: 'Invalid callback parameters' });
        return;
      }

      // Validate state token
      const stateRecord = validateOAuth2State(state);
      if (!stateRecord) {
        res.status(400).json({ error: 'Invalid or expired state token' });
        return;
      }

      // Get connection (by id — the signed state only carries connectionId). This also fixes a
      // prior bug that passed connectionId as the projectId, so the lookup never matched.
      const connection = await getConnectionById(stateRecord.connectionId);
      if (!connection) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      // Handle OAuth2 callback
      await handleOAuth2Callback(connection.projectId, stateRecord.connectionId, code);

      // Clean up state
      cleanupOAuth2State(state);

      logger.info({
        connectionId: stateRecord.connectionId,
      }, 'OAuth2 flow completed:');

      // Redirect to success page
      res.send(`
        <html>
          <body>
            <h1>Authorization Successful</h1>
            <p>Connection "${escapeHtml(connection.name)}" has been authorized.</p>
            <p><a href="/projects/${encodeURIComponent(connection.projectId)}/settings/integrations">Return to Integrations</a></p>
          </body>
        </html>
      `);
    } catch (error) {
      logger.error({ error }, 'Failed to handle OAuth2 callback:');
      res.status(500).json({
        error: 'Failed to handle OAuth2 callback',
      });
    }
  }));
}
