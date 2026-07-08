import { z } from 'zod';

import { logger } from '../../logger';
import { hybridAuth, getAuthUserId } from '../../middleware/auth';
import { batchLimiter, deleteLimiter } from '../../middleware/rateLimiter';
import { datavaultRowsService, datavaultTablesService } from '../../services';
import { asyncHandler } from '../../utils/asyncHandler';
import { classifyRouteError } from '../../utils/routeErrors';

import { ERROR_AUTH_REQUIRED, ERROR_INVALID_INPUT, ERROR_ROW_NOT_FOUND, getTenantId } from './shared';

import type { Express, Request, Response } from 'express';

/**
 * Register DataVault row archiving endpoints (DataVault v3)
 */
export function registerDatavaultRowArchiveRoutes(app: Express): void {
  // NOTE: The literal /rows/bulk/* routes MUST be registered before the
  // parameterized /rows/:rowId/* routes. Express matches in registration
  // order, so registering :rowId first would capture 'bulk' as a rowId.
  registerBulkRoutes(app);
  /**
   * PATCH /api/datavault/rows/:rowId/archive
   * Archive (soft delete) a row
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.patch('/api/datavault/rows/:rowId/archive', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { rowId } = req.params;
      const rowData = await datavaultRowsService.getRow(rowId, tenantId);
      if (!rowData) {
        return res.status(404).json({ message: ERROR_ROW_NOT_FOUND });
      }
      await datavaultTablesService.requirePermission(userId, rowData.row.tableId, tenantId, 'write');
      await datavaultRowsService.archiveRow(tenantId, rowId);
      res.json({ success: true, message: 'Row archived successfully' });
    } catch (error) {
      logger.error({ error }, 'Error archiving DataVault row');
      const { status, message } = classifyRouteError(error, 'Failed to archive row');
      res.status(status).json({ message });
    }
  });
  /**
   * PATCH /api/datavault/rows/:rowId/unarchive
   * Unarchive (restore) a row
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.patch('/api/datavault/rows/:rowId/unarchive', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { rowId } = req.params;
      const rowData = await datavaultRowsService.getRow(rowId, tenantId);
      if (!rowData) {
        return res.status(404).json({ message: ERROR_ROW_NOT_FOUND });
      }
      await datavaultTablesService.requirePermission(userId, rowData.row.tableId, tenantId, 'write');
      await datavaultRowsService.unarchiveRow(tenantId, rowId);
      res.json({ success: true, message: 'Row unarchived successfully' });
    } catch (error) {
      logger.error({ error }, 'Error unarchiving DataVault row');
      const { status, message } = classifyRouteError(error, 'Failed to unarchive row');
      res.status(status).json({ message });
    }
  });
}

/**
 * Register the literal /rows/bulk/* endpoints. Called before the :rowId
 * routes above so Express never captures 'bulk' as a rowId.
 */
function registerBulkRoutes(app: Express): void {
  /**
   * PATCH /api/datavault/rows/bulk/archive
   * Bulk archive rows
   * Body: { rowIds: string[] }
   */
  app.patch('/api/datavault/rows/bulk/archive', batchLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const schema = z.object({
        rowIds: z.array(z.string().uuid()).min(1).max(100),
      });
      const { rowIds } = schema.parse(req.body);

      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const firstRow = await datavaultRowsService.getRow(rowIds[0], tenantId);
      if (!firstRow) {
        return res.status(404).json({ message: ERROR_ROW_NOT_FOUND });
      }
      await datavaultTablesService.requirePermission(userId, firstRow.row.tableId, tenantId, 'write');

      await datavaultRowsService.bulkArchiveRows(tenantId, rowIds);
      res.json({
        success: true,
        message: `${rowIds.length} row(s) archived successfully`,
        count: rowIds.length,
      });
    } catch (error) {
      logger.error({ error }, 'Error bulk archiving DataVault rows');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, 'Failed to archive rows');
      res.status(status).json({ message });
    }
  }));
  /**
   * PATCH /api/datavault/rows/bulk/unarchive
   * Bulk unarchive rows
   * Body: { rowIds: string[] }
   */
  app.patch('/api/datavault/rows/bulk/unarchive', batchLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const schema = z.object({
        rowIds: z.array(z.string().uuid()).min(1).max(100),
      });
      const { rowIds } = schema.parse(req.body);

      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const firstRow = await datavaultRowsService.getRow(rowIds[0], tenantId);
      if (!firstRow) {
        return res.status(404).json({ message: ERROR_ROW_NOT_FOUND });
      }
      await datavaultTablesService.requirePermission(userId, firstRow.row.tableId, tenantId, 'write');

      await datavaultRowsService.bulkUnarchiveRows(tenantId, rowIds);
      res.json({
        success: true,
        message: `${rowIds.length} row(s) unarchived successfully`,
        count: rowIds.length,
      });
    } catch (error) {
      logger.error({ error }, 'Error bulk unarchiving DataVault rows');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, 'Failed to unarchive rows');
      res.status(status).json({ message });
    }
  }));
  /**
   * DELETE /api/datavault/rows/bulk/delete
   * Bulk delete rows (permanent)
   * Body: { rowIds: string[] }
   */
  app.delete('/api/datavault/rows/bulk/delete', deleteLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const schema = z.object({
        rowIds: z.array(z.string().uuid()).min(1).max(100),
      });
      const { rowIds } = schema.parse(req.body);

      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const firstRow = await datavaultRowsService.getRow(rowIds[0], tenantId);
      if (!firstRow) {
        return res.status(404).json({ message: ERROR_ROW_NOT_FOUND });
      }
      await datavaultTablesService.requirePermission(userId, firstRow.row.tableId, tenantId, 'write');

      await datavaultRowsService.bulkDeleteRows(rowIds, tenantId);
      res.json({
        success: true,
        message: `${rowIds.length} row(s) deleted successfully`,
        count: rowIds.length,
      });
    } catch (error) {
      logger.error({ error }, 'Error bulk deleting DataVault rows');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, 'Failed to delete rows');
      res.status(status).json({ message });
    }
  }));
}
