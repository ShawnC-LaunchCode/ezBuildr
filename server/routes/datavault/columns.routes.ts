import { z } from 'zod';

import { insertDatavaultColumnSchema } from '@shared/schema';

import { logger } from '../../logger';
import { hybridAuth, getAuthUserId } from '../../middleware/auth';
import { createLimiter, deleteLimiter } from '../../middleware/rateLimiter';
import { datavaultColumnsService, datavaultTablesService } from '../../services';
import { asyncHandler } from '../../utils/asyncHandler';
import { classifyRouteError } from '../../utils/routeErrors';

import { AuditLogger } from '../../lib/audit/auditLogger';
import { ERROR_AUTH_REQUIRED, ERROR_INVALID_INPUT, getTenantId } from './shared';

import type { Express, Request, Response } from 'express';

/**
 * Register DataVault column endpoints
 */
export function registerDatavaultColumnRoutes(app: Express): void {
  /**
   * GET /api/datavault/tables/:tableId/columns
   * List all columns for a table
   */
  app.get('/api/datavault/tables/:tableId/columns', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      if (!z.string().uuid().safeParse(tableId).success) {
        return res.status(400).json({ message: 'Invalid table ID format' });
      }
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'read');
      const columns = await datavaultColumnsService.listColumns(tableId, tenantId);
      res.json(columns);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault columns');
      const { status, message } = classifyRouteError(error, 'Failed to fetch columns');
      res.status(status).json({ message });
    }
  }));
  /**
   * POST /api/datavault/tables/:tableId/columns
   * Create a new column
   * Requires: owner permission
   */
  app.post('/api/datavault/tables/:tableId/columns', createLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      // Check owner permission
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'owner');
      const columnData = insertDatavaultColumnSchema.parse({
        ...req.body,
        tableId,
      });
      const column = await datavaultColumnsService.createColumn(columnData, tenantId);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.column.created',
        resourceType: 'datavault_column',
        resourceId: column.id,
        after: {
          tableId,
          name: column.name,
          slug: column.slug,
          type: column.type,
          required: column.required,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      res.status(201).json(column);
    } catch (error) {
      logger.error({ error }, 'Error creating DataVault column');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, 'Failed to create column');
      res.status(status).json({ message });
    }
  }));
  /**
   * PATCH /api/datavault/columns/:columnId
   * Update a column (name only - type changes not allowed)
   */
  app.patch('/api/datavault/columns/:columnId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { columnId } = req.params;
      const colData = await datavaultColumnsService.getColumn(columnId, tenantId);
      await datavaultTablesService.requirePermission(userId, colData.tableId, tenantId, 'write');
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        slug: z.string().min(1).optional(),
        required: z.boolean().optional(),
        isUnique: z.boolean().optional(),
        isPrimaryKey: z.boolean().optional(),
        description: z.string().nullable().optional(),
        orderIndex: z.number().int().optional(),
        autonumberPrefix: z.string().nullable().optional(),
        autonumberPadding: z.number().int().min(0).optional(),
      });
      const updateData = updateSchema.parse(req.body);
      const column = await datavaultColumnsService.updateColumn(columnId, tenantId, updateData);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.column.updated',
        resourceType: 'datavault_column',
        resourceId: columnId,
        after: {
          tableId: colData.tableId,
          updatedFields: Object.keys(updateData),
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      res.json(column);
    } catch (error) {
      logger.error({ error }, 'Error updating DataVault column');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, 'Failed to update column');
      res.status(status).json({ message });
    }
  }));
  /**
   * DELETE /api/datavault/columns/:columnId
   * Delete a column (cascades to all values)
   */
  app.delete('/api/datavault/columns/:columnId', deleteLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { columnId } = req.params;
      const colData = await datavaultColumnsService.getColumn(columnId, tenantId);
      await datavaultTablesService.requirePermission(userId, colData.tableId, tenantId, 'write');
      await datavaultColumnsService.deleteColumn(columnId, tenantId);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.column.deleted',
        resourceType: 'datavault_column',
        resourceId: columnId,
        before: {
          tableId: colData.tableId,
          name: colData.name,
          slug: colData.slug,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error deleting DataVault column');
      const { status, message } = classifyRouteError(error, 'Failed to delete column');
      res.status(status).json({ message });
    }
  }));
  /**
   * POST /api/datavault/tables/:tableId/columns/reorder
   * Reorder columns for a table
   */
  app.post('/api/datavault/tables/:tableId/columns/reorder', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { tableId } = req.params;
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'write');
      const reorderSchema = z.object({
        columnIds: z.array(z.string().uuid()),
      });
      const { columnIds } = reorderSchema.parse(req.body);
      await datavaultColumnsService.reorderColumns(tableId, tenantId, columnIds);
      void AuditLogger.log({
        userId,
        tenantId,
        action: 'datavault.column.reordered',
        resourceType: 'datavault_table',
        resourceId: tableId,
        after: {
          tableId,
          columnCount: columnIds.length,
          columnIds: columnIds.slice(0, 50),
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error reordering DataVault columns');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, 'Failed to reorder columns');
      res.status(status).json({ message });
    }
  }));
}
