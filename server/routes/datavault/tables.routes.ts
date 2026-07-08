import { z } from 'zod';

import { insertDatavaultTableSchema } from '@shared/schema';

import { logger } from '../../logger';
import { hybridAuth, getAuthUserId } from '../../middleware/auth';
import { createLimiter, deleteLimiter } from '../../middleware/rateLimiter';
import { datavaultTablesService } from '../../services';
import { asyncHandler } from '../../utils/asyncHandler';
import { classifyRouteError } from '../../utils/routeErrors';

import { ERROR_AUTH_REQUIRED, ERROR_INVALID_INPUT, getTenantId } from './shared';

import type { Express, Request, Response } from 'express';

const ERROR_INVALID_TABLE_ID = 'Invalid table ID format';

/**
 * Register DataVault table endpoints
 */
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
      const tableData = insertDatavaultTableSchema.parse({
        ...req.body,
        tenantId,
        ownerUserId: userId,
      });
      const table = await datavaultTablesService.createTable(tableData);
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
      const { tableId } = req.params;
      const moveSchema = z.object({
        databaseId: z.string().uuid().nullable(),
      });
      const { databaseId } = moveSchema.parse(req.body);
      const table = await datavaultTablesService.moveTable(tableId, tenantId, databaseId);
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
}
