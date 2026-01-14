/**
 * Secrets API Routes
 * Manages encrypted secrets for projects (API keys, tokens, OAuth2 credentials)
 * RBAC: Owner/Builder can manage secrets; Runner/Viewer have no access
 */

import { z } from 'zod';

import { logger } from '../logger';
import { requireProjectRole } from '../middleware/aclAuth';
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { aclService } from '../services/AclService';
import {
  listSecrets,
  getSecretMetadata,
  createSecret,
  updateSecret,
  deleteSecret,
  testSecret,
  type CreateSecretInput,
  type UpdateSecretInput,
} from '../services/secrets';

import type { Express, Request, Response } from 'express';

/**
 * Validation schemas
 */
const createSecretSchema = z.object({
  key: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_-]+$/, 'Key must contain only letters, numbers, underscores, and hyphens'),
  valuePlain: z.string().min(1),
  type: z.enum(['api_key', 'bearer', 'oauth2', 'basic_auth']),
  metadata: z.record(z.any()).optional(),
});

const updateSecretSchema = z.object({
  key: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  valuePlain: z.string().min(1).optional(),
  type: z.enum(['api_key', 'bearer', 'oauth2', 'basic_auth']).optional(),
  metadata: z.record(z.any()).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

/**
 * Register secrets routes
 */
export function registerSecretsRoutes(app: Express): void {
  /**
   * GET /api/projects/:projectId/secrets
   * List all secrets for a project (metadata only, no values)
   * Required role: Owner or Builder
   */
  app.get('/api/projects/:projectId/secrets', hybridAuth, requireProjectRole('edit'), async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { projectId } = req.params;

      // Defense-in-depth: Explicit ACL check for edit access (Dec 2025 - Security fix)
      const hasAccess = await aclService.hasProjectRole(userId, projectId, 'edit');
      if (!hasAccess) {
        logger.warn({ userId, projectId }, 'User denied access to project secrets');
        return res.status(403).json({ message: 'Forbidden - insufficient permissions for this project' });
      }

      const secrets = await listSecrets(projectId);
      res.json(secrets);
    } catch (error) {
      logger.error({ error, projectId: req.params.projectId }, 'Error listing secrets');
      res.status(500).json({
        message: 'Failed to list secrets',
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  });

  /**
   * GET /api/projects/:projectId/secrets/:secretId
   * Get a single secret (metadata only, no value)
   * Required role: Owner or Builder
   */
  app.get('/api/projects/:projectId/secrets/:secretId', hybridAuth, requireProjectRole('edit'), async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { projectId, secretId } = req.params;

      const secret = await getSecretMetadata(projectId, secretId);
      if (!secret) {
        return res.status(404).json({ message: 'Secret not found' });
      }

      res.json(secret);
    } catch (error) {
      logger.error({ error, secretId: req.params.secretId }, 'Error fetching secret');
      res.status(500).json({ message: 'Failed to fetch secret' });
    }
  });

  /**
   * POST /api/projects/:projectId/secrets
   * Create a new secret
   * Required role: Owner or Builder
   */
  app.post('/api/projects/:projectId/secrets', hybridAuth, requireProjectRole('edit'), async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { projectId } = req.params;

      // Validate input
      const validatedData = createSecretSchema.parse(req.body);

      // Create secret
      const input: CreateSecretInput = {
        projectId,
        ...validatedData,
      };

      const secret = await createSecret(input);

      logger.info({ secretId: secret.id, projectId, key: secret.key }, 'Secret created');

      res.status(201).json(secret);
    } catch (error) {
      logger.error({ error, projectId: req.params.projectId }, 'Error creating secret');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Validation error',
          errors: error.errors,
        });
      }

      if (error instanceof Error && error.message.includes('already exists')) {
        return res.status(409).json({ message: error.message });
      }

      res.status(500).json({
        message: 'Failed to create secret',
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  });

  /**
   * PATCH /api/projects/:projectId/secrets/:secretId
   * Update a secret (rotate value, change key, update metadata)
   * Required role: Owner or Builder
   */
  app.patch('/api/projects/:projectId/secrets/:secretId', hybridAuth, requireProjectRole('edit'), async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { projectId, secretId } = req.params;

      // Validate input
      const validatedData = updateSecretSchema.parse(req.body);

      // Update secret
      const input: UpdateSecretInput = validatedData;
      const secret = await updateSecret(projectId, secretId, input);

      logger.info({ secretId, projectId }, 'Secret updated');

      res.json(secret);
    } catch (error) {
      logger.error({ error, secretId: req.params.secretId }, 'Error updating secret');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Validation error',
          errors: error.errors,
        });
      }

      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes('already exists')) {
          return res.status(409).json({ message: error.message });
        }
      }

      res.status(500).json({
        message: 'Failed to update secret',
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  });

  /**
   * DELETE /api/projects/:projectId/secrets/:secretId
   * Delete a secret
   * Required role: Owner or Builder
   */
  app.delete('/api/projects/:projectId/secrets/:secretId', hybridAuth, requireProjectRole('edit'), async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { projectId, secretId } = req.params;

      const deleted = await deleteSecret(projectId, secretId);
      if (!deleted) {
        return res.status(404).json({ message: 'Secret not found' });
      }

      logger.info({ secretId, projectId }, 'Secret deleted');

      res.status(204).send();
    } catch (error) {
      logger.error({ error, secretId: req.params.secretId }, 'Error deleting secret');
      res.status(500).json({ message: 'Failed to delete secret' });
    }
  });

  /**
   * POST /api/projects/:projectId/secrets/:secretId/test
   * Test if a secret can be decrypted successfully
   * Required role: Owner or Builder
   */
  app.post('/api/projects/:projectId/secrets/:secretId/test', hybridAuth, requireProjectRole('edit'), async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }

      const { projectId, secretId } = req.params;

      const success = await testSecret(projectId, secretId);

      res.json({ success });
    } catch (error) {
      logger.error({ error, secretId: req.params.secretId }, 'Error testing secret');
      res.status(500).json({ message: 'Failed to test secret' });
    }
  });
}
