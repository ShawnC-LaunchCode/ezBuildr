import { z } from 'zod';

import { DATAVAULT_CONFIG } from '@shared/config';
import { datavaultRowFilterSchema, type DatavaultRowFilter } from '@shared/schema';

import { logger } from '../../logger';
import { hybridAuth, getAuthUserId } from '../../middleware/auth';
import { batchLimiter, deleteLimiter, strictLimiter } from '../../middleware/rateLimiter';
import { datavaultRowsService, datavaultTablesService } from '../../services';
import { asyncHandler } from '../../utils/asyncHandler';
import { classifyRouteError } from '../../utils/routeErrors';

import { ERROR_AUTH_REQUIRED, ERROR_INVALID_INPUT, ERROR_ROW_NOT_FOUND, getTenantId } from './shared';

import type { Express, Request, Response } from 'express';

/**
 * Register DataVault row endpoints (CRUD and reference resolution)
 */
export function registerDatavaultRowRoutes(app: Express): void {
  /**
   * POST /api/datavault/references/batch
   * Batch resolve reference values (fixes N+1 query problem)
   * Body: { requests: [{ tableId, rowIds[], displayColumnSlug? }] }
   */
  app.post('/api/datavault/references/batch', batchLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const schema = z.object({
        requests: z.array(
          z.object({
            tableId: z.string().uuid(),
            rowIds: z.array(z.string().uuid()),
            displayColumnSlug: z.string().optional(),
          })
        ),
      });
      const { requests } = schema.parse(req.body);

      // Enforce read permission for each table
      const uniqueTableIds = [...new Set(requests.map(r => r.tableId))];
      await Promise.all(uniqueTableIds.map(tableId =>
        datavaultTablesService.requirePermission(userId, tableId, tenantId, 'read')
      ));

      // DOS PROTECTION FIX: Validate batch size to prevent resource exhaustion
      if (requests.length > DATAVAULT_CONFIG.MAX_BATCH_REQUESTS) {
        return res.status(400).json({
          message: `Batch size exceeds maximum allowed value of ${DATAVAULT_CONFIG.MAX_BATCH_REQUESTS} requests`
        });
      }
      const resultMap = await datavaultRowsService.batchResolveReferences(requests, tenantId);
      // Convert Map to object for JSON serialization
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: Record<string, { displayValue: string; row: any }> = {};
      resultMap.forEach((value, key) => {
        result[key] = value;
      });
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Error batch resolving references');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, 'Failed to resolve references');
      res.status(status).json({ message });
    }
  }));
  /**
   * GET /api/datavault/tables/:tableId/rows
   * List all rows for a table with offset-based pagination, sorting, and archiving support
   * Query params:
   *  - limit (max 100), offset (default 0)
   *  - showArchived (true/false, default false) - include archived rows
   *  - sortBy (column slug or createdAt/updatedAt)
   *  - sortOrder (asc/desc, default asc)
   * Requires: read permission
   */
  app.get('/api/datavault/tables/:tableId/rows', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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
      // Check read permission
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'read');
      // SECURITY FIX: Validate pagination parameters properly (no NaN from parseInt)
      const { paginationSchema } = await import('../../utils/validation');
      const pagination = paginationSchema.parse({
        limit: req.query.limit,
        offset: req.query.offset,
      });
      const { limit, offset } = pagination;
      const showArchived = req.query.showArchived === 'true';
      const sortBy = req.query.sortBy as string | undefined;
      const sortOrder = (req.query.sortOrder === 'desc' ? 'desc' : 'asc');

      let parsedFilters: DatavaultRowFilter[] | undefined;
      if (req.query.filters !== undefined && req.query.filters !== '') {
        let rawFilters: unknown = req.query.filters;
        if (typeof rawFilters === 'string') {
          try {
            rawFilters = JSON.parse(rawFilters) as unknown;
          } catch {
            return res.status(400).json({ message: ERROR_INVALID_INPUT, error: 'Invalid filters JSON' });
          }
        }
        const filtersValidation = z
          .array(datavaultRowFilterSchema)
          .max(DATAVAULT_CONFIG.MAX_FILTERS)
          .safeParse(rawFilters);

        if (!filtersValidation.success) {
          return res.status(400).json({
            message: ERROR_INVALID_INPUT,
            errors: filtersValidation.error.errors,
          });
        }
        parsedFilters = filtersValidation.data;
      }

      // Use new getRowsWithOptions method that supports archiving, sorting, and filtering
      const result = await datavaultRowsService.getRowsWithOptions(
        tenantId,
        tableId,
        { limit, offset, showArchived, sortBy, sortOrder, filters: parsedFilters }
      );
      const hasMore = offset + result.rows.length < result.total;
      res.json({
        rows: result.rows,
        pagination: {
          limit,
          offset,
          total: result.total,
          hasMore,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault rows');
      const { status, message } = classifyRouteError(error, 'Failed to fetch rows');
      res.status(status).json({ message });
    }
  }));
  /**
   * POST /api/datavault/tables/:tableId/rows
   * Create a new row with values
   * Requires: write permission
   */
  app.post('/api/datavault/tables/:tableId/rows', strictLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      // Check write permission
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'write');
      const rowSchema = z.object({
        values: z.record(z.string(), z.any()), // columnId -> value
      });
      const { values } = rowSchema.parse(req.body);
      const result = await datavaultRowsService.createRow(tableId, tenantId, values, userId);
      res.status(201).json(result);
    } catch (error) {
      logger.error({ error }, 'Error creating DataVault row');
      if (error instanceof Error) { logger.debug({ error: error.message }, 'Row creation error message'); }
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      // Validation errors from the row service are intentional 4xx messages.
      const raw = error instanceof Error ? error.message : '';
      if (raw.includes('not a valid option') || raw.includes('missing') || raw.includes('Required')) {
        return res.status(400).json({ message: raw });
      }
      const { status, message } = classifyRouteError(error, 'Failed to create row');
      res.status(status).json({ message });
    }
  }));
  /**
   * GET /api/datavault/rows/:rowId
   * Get a single row with all its values
   */
  app.get('/api/datavault/rows/:rowId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      const { rowId } = req.params;
      const row = await datavaultRowsService.getRow(rowId, tenantId);
      if (!row) {
        return res.status(404).json({ message: ERROR_ROW_NOT_FOUND });
      }
      await datavaultTablesService.requirePermission(userId, row.row.tableId, tenantId, 'read');
      res.json(row);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault row');
      const { status, message } = classifyRouteError(error, 'Failed to fetch row');
      res.status(status).json({ message });
    }
  }));
  /**
   * PATCH /api/datavault/rows/:rowId
   * Update a row's values
   * Requires: write permission
   */
  app.patch('/api/datavault/rows/:rowId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { rowId } = req.params;
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      // Get row to determine tableId for permission check
      const rowData = await datavaultRowsService.getRow(rowId, tenantId);
      if (!rowData) {
        return res.status(404).json({ message: ERROR_ROW_NOT_FOUND });
      }
      // Check write permission
      await datavaultTablesService.requirePermission(userId, rowData.row.tableId, tenantId, 'write');
      const updateSchema = z.object({
        values: z.record(z.string(), z.any()), // columnId -> value
      });
      const { values } = updateSchema.parse(req.body);
      await datavaultRowsService.updateRow(rowId, tenantId, values, userId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error updating DataVault row');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: ERROR_INVALID_INPUT,
          errors: error.errors,
        });
      }
      const { status, message } = classifyRouteError(error, 'Failed to update row');
      res.status(status).json({ message });
    }
  }));
  /**
   * GET /api/datavault/rows/:rowId/references
   * Check if row is referenced by other rows
   * Returns list of tables/columns that reference this row
   */
  app.get('/api/datavault/rows/:rowId/references', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
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
      await datavaultTablesService.requirePermission(userId, rowData.row.tableId, tenantId, 'read');
      const references = await datavaultRowsService.getRowReferences(rowId, tenantId);
      res.json({
        rowId,
        isReferenced: references.length > 0,
        references,
        totalReferences: references.reduce((sum, ref) => sum + ref.referenceCount, 0)
      });
    } catch (error) {
      logger.error({ error }, 'Error checking row references');
      const { status, message } = classifyRouteError(error, 'Failed to check references');
      res.status(status).json({ message });
    }
  }));
  /**
   * DELETE /api/datavault/rows/:rowId
   * Delete a row and all its values
   * Note: References to this row will be automatically set to NULL by database trigger
   * Requires: write permission
   */
  app.delete('/api/datavault/rows/:rowId', deleteLimiter, hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { rowId } = req.params;
      if (!userId) {
        return res.status(401).json({ message: ERROR_AUTH_REQUIRED });
      }
      // Get row to determine tableId for permission check
      const rowData = await datavaultRowsService.getRow(rowId, tenantId);
      if (!rowData) {
        return res.status(404).json({ message: ERROR_ROW_NOT_FOUND });
      }
      // Check write permission
      await datavaultTablesService.requirePermission(userId, rowData.row.tableId, tenantId, 'write');
      await datavaultRowsService.deleteRow(rowId, tenantId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error deleting DataVault row');
      const { status, message } = classifyRouteError(error, 'Failed to delete row');
      res.status(status).json({ message });
    }
  }));
}
