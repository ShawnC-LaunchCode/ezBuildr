import { z } from 'zod';

import { logger } from '../../logger';
import { hybridAuth, getAuthUserId } from '../../middleware/auth';
import { createLimiter, deleteLimiter } from '../../middleware/rateLimiter';
import { datavaultTablesService } from '../../services';
import { datavaultDatabasesService } from '../../services/DatavaultDatabasesService';
import { asyncHandler } from '../../utils/asyncHandler';
import { classifyRouteError } from '../../utils/routeErrors';

import { AuditLogger } from '../../lib/audit/auditLogger';
import { ERROR_AUTH_REQUIRED, ERROR_INVALID_INPUT, getTenantId } from './shared';

import type { Express, Request, Response } from 'express';

const ERROR_INVALID_TABLE_ID = 'Invalid table ID format';
const USER_AGENT_HEADER = 'user-agent';

/**
 * Register DataVault table endpoints
 */
// eslint-disable-next-line max-lines-per-function
export function registerDatavaultTableRoutes(app: Express): void {
  /**
   * GET /api/datavault/tables
   * List all tables for the authenticated tenant
   */
  app.get('/api/datavault/tables', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const withStats = req.query.stats === 'true';
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const tables = withStats
        ? await datavaultTablesService.listTablesWithStats(tenantId, userId)
        : await datavaultTablesService.listTables(tenantId, userId);
      res.json(tables);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault tables');
      const message = 'Failed to fetch tables';
      res.status(500).json({ message });
    }
  }));
  /**
   * POST /api/datavault/tables
   * Create a new table
   */
  app.post('/api/datavault/tables', createLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const createSchema = z.object({
        name: z.string().min(1),
        slug: z.string().min(1).optional(),
        description: z.string().optional(),
        databaseId: z.string().uuid().optional().nullable(),
        ownerType: z.enum(['user', 'org']).optional(),
        ownerUuid: z.string().uuid().optional(),
      });
      const input = createSchema.parse(req.body);
      if (input.databaseId) {
        await datavaultDatabasesService.verifyDatabaseAccess(input.databaseId, tenantId, userId, 'edit');
      }
      const table = await datavaultTablesService.createTable({
        tenantId,
        ownerUserId: userId,
        name: input.name,
        slug: input.slug,
        description: input.description,
        databaseId: input.databaseId ?? null,
        ownerType: input.ownerType,
        ownerUuid: input.ownerUuid,
      });
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.table.created',
        resourceType: 'datavault_table',
        resourceId: table.id,
        after: {
          name: table.name,
          slug: table.slug,
          databaseId: table.databaseId,
        },
        ipAddress: req.ip,
        userAgent: req.get(USER_AGENT_HEADER),
      });
      res.status(201).json(table);
    } catch (error) {
      logger.error({ error }, 'Error creating DataVault table');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const message = 'Failed to create table';
      res.status(500).json({ message });
    }
  }));
  /**
   * GET /api/datavault/tables/:tableId
   * Get a single table with optional columns
   * Requires: read permission
   */
  app.get('/api/datavault/tables/:tableId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      const includeColumns = req.query.columns === 'true';
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      if (!z.string().uuid().safeParse(tableId).success) {
        return res.status(400).json({ message: ERROR_INVALID_TABLE_ID });
      }
      // Check read permission
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'read');
      const table = includeColumns
        ? await datavaultTablesService.getTableWithColumns(tableId, tenantId)
        : await datavaultTablesService.getTable(tableId, tenantId);
      res.json(table);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault table');
      const { status, message } = classifyRouteError(error, 'Failed to fetch table');
      res.status(status).json({ message });
    }
  }));
  /**
   * PATCH /api/datavault/tables/:tableId
   * Update a table
   * Requires: owner permission
   */
  app.patch('/api/datavault/tables/:tableId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      // Check owner permission
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'owner');
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        slug: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
      });
      const updateData = updateSchema.parse(req.body);
      const table = await datavaultTablesService.updateTable(tableId, tenantId, updateData);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.table.updated',
        resourceType: 'datavault_table',
        resourceId: tableId,
        after: {
          updatedFields: Object.keys(updateData),
          name: table.name,
          slug: table.slug,
        },
        ipAddress: req.ip,
        userAgent: req.get(USER_AGENT_HEADER),
      });
      res.json(table);
    } catch (error) {
      logger.error({ error }, 'Error updating DataVault table');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, 'Failed to update table');
      res.status(status).json({ message });
    }
  }));
  /**
   * PATCH /api/datavault/tables/:tableId/move
   * Move table to a database or main folder
   */
  app.patch('/api/datavault/tables/:tableId/move', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { tableId } = req.params;
      const moveSchema = z.object({
        databaseId: z.string().uuid().nullable(),
      });
      const { databaseId } = moveSchema.parse(req.body);
      const table = await datavaultTablesService.moveTable(tableId, tenantId, databaseId, userId);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.table.moved',
        resourceType: 'datavault_table',
        resourceId: tableId,
        after: {
          databaseId,
        },
        ipAddress: req.ip,
        userAgent: req.get(USER_AGENT_HEADER),
      });
      res.json(table);
    } catch (error) {
      logger.error({ error }, 'Error moving DataVault table');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, 'Failed to move table');
      res.status(status).json({ message });
    }
  }));
  /**
   * DELETE /api/datavault/tables/:tableId
   * Delete a table (cascades to columns, rows, and values)
   * Requires: owner permission
   */
  app.delete('/api/datavault/tables/:tableId', deleteLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      // Check owner permission
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'owner');
      await datavaultTablesService.deleteTable(tableId, tenantId);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.table.deleted',
        resourceType: 'datavault_table',
        resourceId: tableId,
        before: {
          tableId,
        },
        ipAddress: req.ip,
        userAgent: req.get(USER_AGENT_HEADER),
      });
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error deleting DataVault table');
      const { status, message } = classifyRouteError(error, 'Failed to delete table');
      res.status(status).json({ message });
    }
  }));
  /**
   * GET /api/datavault/tables/:tableId/schema
   * Get table schema (for workflow builder integration)
   * Returns: { id, name, slug, description, databaseId, columns: [...] }
   * Requires: read permission
   */
  app.get('/api/datavault/tables/:tableId/schema', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      if (!z.string().uuid().safeParse(tableId).success) {
        return res.status(400).json({ message: ERROR_INVALID_TABLE_ID });
      }
      // Check read permission
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'read');
      const schema = await datavaultTablesService.getTableSchema(tableId, tenantId);
      res.json(schema);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault table schema');
      const { status, message } = classifyRouteError(error, 'Failed to fetch table schema');
      res.status(status).json({ message });
    }
  }));

  /**
   * GET /api/datavault/tables/:tableId/access
   * Get access entries and caller role for a table.
   */
  app.get('/api/datavault/tables/:tableId/access', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      if (!userId) {
        return res.status(401).json({ success: false, error: ERROR_AUTH_REQUIRED });
      }
      const access = await datavaultTablesService.getTableAccess(tableId, tenantId, userId);
      res.json({ success: true, data: access.entries, currentUserRole: access.currentUserRole });
    } catch (error) {
      logger.error({ error }, 'Error fetching table access');
      const { status, message } = classifyRouteError(error, 'Failed to fetch table access');
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * PUT /api/datavault/tables/:tableId/access
   * Grant or update table access.
   */
  app.put('/api/datavault/tables/:tableId/access', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      if (!userId) {
        return res.status(401).json({ success: false, error: ERROR_AUTH_REQUIRED });
      }
      const schema = z.object({
        entries: z.array(z.object({
          principalType: z.enum(['user', 'team']),
          principalId: z.string(),
          role: z.enum(['view', 'edit', 'owner']),
        })),
      });
      const { entries } = schema.parse(req.body);
      const access = await datavaultTablesService.grantTableAccess(tableId, tenantId, userId, entries);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.table.access_granted',
        resourceType: 'datavault_table',
        resourceId: tableId,
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
      logger.error({ error }, 'Error granting table access');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: ERROR_INVALID_INPUT, details: error.errors });
      }
      const { status, message } = classifyRouteError(error, 'Failed to grant table access');
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * DELETE /api/datavault/tables/:tableId/access
   * Revoke table access.
   */
  app.delete('/api/datavault/tables/:tableId/access', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      if (!userId) {
        return res.status(401).json({ success: false, error: ERROR_AUTH_REQUIRED });
      }
      const schema = z.object({
        entries: z.array(z.object({
          principalType: z.enum(['user', 'team']),
          principalId: z.string(),
        })),
      });
      const { entries } = schema.parse(req.body);
      await datavaultTablesService.revokeTableAccess(tableId, tenantId, userId, entries);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.table.access_revoked',
        resourceType: 'datavault_table',
        resourceId: tableId,
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
      logger.error({ error }, 'Error revoking table access');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: ERROR_INVALID_INPUT, details: error.errors });
      }
      const { status, message } = classifyRouteError(error, 'Failed to revoke table access');
      res.status(status).json({ success: false, error: message });
    }
  }));

  /**
   * POST /api/datavault/tables/:tableId/transfer
   * Transfer standalone table ownership.
   */
  app.post('/api/datavault/tables/:tableId/transfer', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      if (!userId) {
        return res.status(401).json({ success: false, error: ERROR_AUTH_REQUIRED });
      }
      const schema = z.object({
        targetOwnerType: z.enum(['user', 'org']),
        targetOwnerUuid: z.string().uuid(),
      });
      const { targetOwnerType, targetOwnerUuid } = schema.parse(req.body);
      const table = await datavaultTablesService.transferOwnership(
        tableId,
        tenantId,
        userId,
        targetOwnerType,
        targetOwnerUuid
      );
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.table.ownership_transferred',
        resourceType: 'datavault_table',
        resourceId: tableId,
        after: {
          targetOwnerType,
          targetOwnerUuid,
        },
        ipAddress: req.ip,
        userAgent: req.get(USER_AGENT_HEADER),
      });
      res.json({ success: true, data: table });
    } catch (error) {
      logger.error({ error }, 'Error transferring table ownership');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: ERROR_INVALID_INPUT, details: error.errors });
      }
      const { status, message } = classifyRouteError(error, 'Failed to transfer table ownership');
      res.status(status).json({ success: false, error: message });
    }
  }));
}
