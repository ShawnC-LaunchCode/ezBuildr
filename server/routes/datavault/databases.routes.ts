import { z } from 'zod';

import { logger } from '../../logger';
import { hybridAuth, getAuthUserId } from '../../middleware/auth';
import { createLimiter, deleteLimiter } from '../../middleware/rateLimiter';
import { aclService } from '../../services/AclService';
import { datavaultDatabasesService } from '../../services/DatavaultDatabasesService';
import { asyncHandler } from '../../utils/asyncHandler';
import { classifyRouteError } from '../../utils/routeErrors';
import { validationMessages } from '../../utils/validationMessages';

import { AuditLogger } from '../../lib/audit/auditLogger';
import { ERROR_AUTH_REQUIRED, ERROR_INVALID_INPUT, getTenantId } from './shared';

import type { Express, Request, Response } from 'express';

const USER_AGENT_HEADER = 'user-agent';

/**
 * Register DataVault database endpoints
 */
// eslint-disable-next-line max-lines-per-function
export function registerDatavaultDatabaseRoutes(app: Express): void {
  /**
   * GET /api/datavault/databases
   * List all databases for the authenticated tenant
   */
  app.get('/api/datavault/databases', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { scopeType, scopeId } = req.query;
      let databases;
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (scopeType && typeof scopeType === 'string') {
        // SECURITY FIX: Verify user has access to the requested scope before returning data
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (scopeId && typeof scopeId === 'string') {
          if (scopeType === 'project') {
            // Verify user has at least 'view' access to the project
            const projectRole = await aclService.resolveRoleForProject(userId, scopeId);
            if (projectRole === 'none') {
              return res.status(403).json({
                message: 'Access denied: You do not have permission to view this project'
              });
            }
          } else if (scopeType === 'workflow') {
            // Verify user has at least 'view' access to the workflow
            const workflowRole = await aclService.resolveRoleForWorkflow(userId, scopeId);
            if (workflowRole === 'none') {
              return res.status(403).json({
                message: 'Access denied: You do not have permission to view this workflow'
              });
            }
          }
          // For 'account' scope: tenantId check is sufficient (already done above)
        }
        const scopeTypeParsed = z.enum(['account', 'project', 'workflow']).safeParse(scopeType);
        if (!scopeTypeParsed.success) {
          return res.status(400).json({ message: 'Invalid scopeType. Must be account, project, or workflow.' });
        }
        databases = await datavaultDatabasesService.getDatabasesByScope(
          tenantId,
          scopeTypeParsed.data,
          scopeId as string,
          userId
        );
      } else {
        databases = await datavaultDatabasesService.getDatabasesForTenant(tenantId, userId);
      }
      res.json(databases);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault databases');
      const message = 'Failed to fetch databases';
      res.status(500).json({ message });
    }
  }));
  /**
   * POST /api/datavault/databases
   * Create a new database
   */
  app.post('/api/datavault/databases', createLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const createSchema = z.object({
        name: z.string()
          .min(1, { message: validationMessages.database.nameMinLength })
          .max(255, { message: validationMessages.database.nameMaxLength }),
        description: z.string()
          .max(1000, { message: validationMessages.database.descriptionMaxLength })
          .optional(),
        scopeType: z.enum(['account', 'project', 'workflow'], {
          errorMap: () => ({ message: validationMessages.invalidOption('scopeType', ['account', 'project', 'workflow']) })
        }),
        scopeId: z.string().uuid({ message: validationMessages.invalidUuid }).optional(),
        ownerType: z.enum(['user', 'org']).optional(),
        ownerUuid: z.string().uuid({ message: validationMessages.invalidUuid }).optional(),
      });
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const input = createSchema.parse(req.body);
      const database = await datavaultDatabasesService.createDatabase({
        ...input,
        tenantId,
        creatorId: userId,
      });
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.database.created',
        resourceType: 'datavault_database',
        resourceId: database.id,
        after: {
          name: database.name,
          scopeType: database.scopeType,
          scopeId: database.scopeId,
        },
        ipAddress: req.ip,
        userAgent: req.get(USER_AGENT_HEADER),
      });
      res.status(201).json(database);
    } catch (error) {
      logger.error({ error }, 'Error creating DataVault database');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const message = 'Failed to create database';
      res.status(500).json({ message });
    }
  }));
  /**
   * GET /api/datavault/databases/:id
   * Get a single database with stats
   */
  app.get('/api/datavault/databases/:id', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { id } = req.params;
      const database = await datavaultDatabasesService.getDatabaseById(id, tenantId, userId);
      res.json(database);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault database');
      const { status, message } = classifyRouteError(error, 'Failed to fetch database');
      res.status(status).json({ message });
    }
  }));
  /**
   * PATCH /api/datavault/databases/:id
   * Update a database
   */
  app.patch('/api/datavault/databases/:id', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { id } = req.params;
      const updateSchema = z.object({
        name: z.string()
          .min(1, { message: validationMessages.database.nameMinLength })
          .max(255, { message: validationMessages.database.nameMaxLength })
          .optional(),
        description: z.string()
          .max(1000, { message: validationMessages.database.descriptionMaxLength })
          .optional(),
        scopeType: z.enum(['account', 'project', 'workflow'], {
          errorMap: () => ({ message: validationMessages.invalidOption('scopeType', ['account', 'project', 'workflow']) })
        }).optional(),
        scopeId: z.string().uuid({ message: validationMessages.invalidUuid }).optional().nullable(),
      });
      const input = updateSchema.parse(req.body);
      const database = await datavaultDatabasesService.updateDatabase(id, tenantId, {
        ...input,
        scopeId: input.scopeId ?? undefined,
      }, userId);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.database.updated',
        resourceType: 'datavault_database',
        resourceId: id,
        after: {
          updatedFields: Object.keys(input),
          name: database.name,
        },
        ipAddress: req.ip,
        userAgent: req.get(USER_AGENT_HEADER),
      });
      res.json(database);
    } catch (error) {
      logger.error({ error }, 'Error updating DataVault database');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, 'Failed to update database');
      res.status(status).json({ message });
    }
  }));
  /**
   * DELETE /api/datavault/databases/:id
   * Delete a database (tables will be moved to main folder)
   */
  app.delete('/api/datavault/databases/:id', deleteLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { id } = req.params;
      await datavaultDatabasesService.deleteDatabaseForUser(id, tenantId, userId);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.database.deleted',
        resourceType: 'datavault_database',
        resourceId: id,
        before: {
          id,
        },
        ipAddress: req.ip,
        userAgent: req.get(USER_AGENT_HEADER),
      });
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error deleting DataVault database');
      const { status, message } = classifyRouteError(error, 'Failed to delete database');
      res.status(status).json({ message });
    }
  }));
  /**
   * GET /api/datavault/databases/:id/tables
   * Get all tables in a database
   */
  app.get('/api/datavault/databases/:id/tables', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { id } = req.params;
      const tables = await datavaultDatabasesService.getTablesInDatabase(id, tenantId, userId);
      res.json(tables);
    } catch (error) {
      logger.error({ error }, 'Error fetching database tables');
      const { status, message } = classifyRouteError(error, 'Failed to fetch tables');
      res.status(status).json({ message });
    }
  }));
  /**
   * POST /api/datavault/databases/:databaseId/transfer
   * Transfer database ownership (new ownership model)
   * Tables inherit ownership from database
   * Body: { targetOwnerType: 'user' | 'org', targetOwnerUuid: string }
   */
  app.post('/api/datavault/databases/:databaseId/transfer', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized - no user ID' });
      }
      const { databaseId } = req.params;
      const schema = z.object({
        targetOwnerType: z.enum(['user', 'org']),
        targetOwnerUuid: z.string().uuid(),
      });
      const { targetOwnerType, targetOwnerUuid } = schema.parse(req.body);
      const database = await datavaultDatabasesService.transferOwnership(
        databaseId,
        userId,
        targetOwnerType,
        targetOwnerUuid
      );
      void AuditLogger.log({
        userId,
        tenantId: database?.tenantId ?? undefined,
        action: 'datavault.database.ownership_transferred',
        resourceType: 'datavault_database',
        resourceId: databaseId,
        after: {
          targetOwnerType,
          targetOwnerUuid,
        },
        ipAddress: req.ip,
        userAgent: req.get(USER_AGENT_HEADER),
      });
      logger.info({ databaseId, targetOwnerType, targetOwnerUuid, userId }, 'Database ownership transferred');
      res.json({ success: true, data: database });
    } catch (error) {
      logger.error({ error, databaseId: req.params.databaseId }, "Error transferring database ownership");
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: ERROR_INVALID_INPUT,
          details: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, "Failed to transfer database ownership");
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * GET /api/datavault/databases/:databaseId/access
   * Get access entries and caller role for a database.
   */
  app.get('/api/datavault/databases/:databaseId/access', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, error: ERROR_AUTH_REQUIRED });
      }
      const { databaseId } = req.params;
      const access = await datavaultDatabasesService.getDatabaseAccess(databaseId, tenantId, userId);
      res.json({ success: true, data: access.entries, currentUserRole: access.currentUserRole });
    } catch (error) {
      logger.error({ error, databaseId: req.params.databaseId }, 'Error fetching database access');
      const { status, message } = classifyRouteError(error, 'Failed to fetch database access');
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * PUT /api/datavault/databases/:databaseId/access
   * Grant or update database access.
   */
  app.put('/api/datavault/databases/:databaseId/access', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, error: ERROR_AUTH_REQUIRED });
      }
      const { databaseId } = req.params;
      const schema = z.object({
        entries: z.array(z.object({
          principalType: z.enum(['user', 'team']),
          principalId: z.string(),
          role: z.enum(['view', 'edit', 'owner']),
        })),
      });
      const { entries } = schema.parse(req.body);
      const access = await datavaultDatabasesService.grantDatabaseAccess(databaseId, tenantId, userId, entries);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.database.access_granted',
        resourceType: 'datavault_database',
        resourceId: databaseId,
        after: {
          entriesCount: entries.length,
          entries: entries.slice(0, 50).map((entry) => ({
            ...entry,
            principalId: entry.principalId.slice(0, 128),
          })),
        },
        ipAddress: req.ip,
        userAgent: req.get(USER_AGENT_HEADER),
      });
      res.json({ success: true, data: access });
    } catch (error) {
      logger.error({ error, databaseId: req.params.databaseId }, 'Error granting database access');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: ERROR_INVALID_INPUT, details: error.errors });
      }
      const { status, message } = classifyRouteError(error, 'Failed to grant database access');
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * DELETE /api/datavault/databases/:databaseId/access
   * Revoke database access.
   */
  app.delete('/api/datavault/databases/:databaseId/access', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, error: ERROR_AUTH_REQUIRED });
      }
      const { databaseId } = req.params;
      const schema = z.object({
        entries: z.array(z.object({
          principalType: z.enum(['user', 'team']),
          principalId: z.string(),
        })),
      });
      const { entries } = schema.parse(req.body);
      await datavaultDatabasesService.revokeDatabaseAccess(databaseId, tenantId, userId, entries);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.database.access_revoked',
        resourceType: 'datavault_database',
        resourceId: databaseId,
        before: {
          entriesCount: entries.length,
          entries: entries.slice(0, 50).map((entry) => ({
            ...entry,
            principalId: entry.principalId.slice(0, 128),
          })),
        },
        ipAddress: req.ip,
        userAgent: req.get(USER_AGENT_HEADER),
      });
      res.json({ success: true, message: 'Access revoked successfully' });
    } catch (error) {
      logger.error({ error, databaseId: req.params.databaseId }, 'Error revoking database access');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: ERROR_INVALID_INPUT, details: error.errors });
      }
      const { status, message } = classifyRouteError(error, 'Failed to revoke database access');
      res.status(status).json({ success: false, error: message });
    }
  }));
}
