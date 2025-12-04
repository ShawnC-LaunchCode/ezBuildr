import type { Express, Request, Response } from 'express';
import { hybridAuth, type AuthRequest, getAuthUserTenantId, getAuthUserId } from '../middleware/auth';
import {
  apiLimiter,
  batchLimiter,
  createLimiter,
  deleteLimiter,
  strictLimiter,
} from '../middleware/rateLimiter';
import {
  insertDatavaultTableSchema,
  insertDatavaultColumnSchema,
  insertDatavaultRowSchema,
} from '@shared/schema';
import {
  datavaultTablesService,
  datavaultColumnsService,
  datavaultRowsService,
  datavaultRowNotesService,
  datavaultTablePermissionsService,
} from '../services';
import { datavaultDatabasesService } from '../services/DatavaultDatabasesService';
import { z } from 'zod';
import { logger } from '../logger';
import { DATAVAULT_CONFIG } from '@shared/config';
import { validationMessages } from '../utils/validationMessages';

/**
 * Register DataVault routes
 * DataVault Phase 1: Tenant-scoped custom data tables
 *
 * DataVault provides a flexible data storage system where creators can define
 * custom tables, columns, and manage data without altering the database schema.
 */
export function registerDatavaultRoutes(app: Express): void {
  // Apply global rate limiting to all DataVault routes
  app.use('/api/datavault', apiLimiter);

  // Helper to get tenantId with proper error handling
  const getTenantId = (req: Request): string => {
    const tenantId = getAuthUserTenantId(req);
    if (!tenantId) {
      logger.error(
        {
          userId: getAuthUserId(req),
          path: req.path
        },
        'User session missing tenantId - user may need to log out and log back in'
      );
      throw new Error('Your account is not properly configured. Please log out and log back in to fix this issue.');
    }
    return tenantId;
  };

  // ===================================================================
  // DATABASE ENDPOINTS
  // ===================================================================

  /**
   * GET /api/datavault/databases
   * List all databases for the authenticated tenant
   */
  app.get('/api/datavault/databases', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { scopeType, scopeId } = req.query;

      let databases;
      if (scopeType && typeof scopeType === 'string') {
        databases = await datavaultDatabasesService.getDatabasesByScope(
          tenantId,
          scopeType as any,
          scopeId as string
        );
      } else {
        databases = await datavaultDatabasesService.getDatabasesForTenant(tenantId);
      }

      res.json(databases);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault databases');
      const message = error instanceof Error ? error.message : 'Failed to fetch databases';
      res.status(500).json({ message });
    }
  });

  /**
   * POST /api/datavault/databases
   * Create a new database
   */
  app.post('/api/datavault/databases', createLimiter, hybridAuth, async (req: Request, res: Response) => {
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
      });

      const input = createSchema.parse(req.body);
      const database = await datavaultDatabasesService.createDatabase({
        ...input,
        tenantId,
      });

      res.status(201).json(database);
    } catch (error) {
      logger.error({ error }, 'Error creating DataVault database');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create database';
      res.status(500).json({ message });
    }
  });

  /**
   * GET /api/datavault/databases/:id
   * Get a single database with stats
   */
  app.get('/api/datavault/databases/:id', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const database = await datavaultDatabasesService.getDatabaseById(id, tenantId);
      res.json(database);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault database');
      const message = error instanceof Error ? error.message : 'Failed to fetch database';
      const status = message.includes('not found') ? 404 : message.includes('Unauthorized') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PATCH /api/datavault/databases/:id
   * Update a database
   */
  app.patch('/api/datavault/databases/:id', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
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
      });

      res.json(database);
    } catch (error) {
      logger.error({ error }, 'Error updating DataVault database');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to update database';
      const status = message.includes('not found') ? 404 : message.includes('Unauthorized') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/datavault/databases/:id
   * Delete a database (tables will be moved to main folder)
   */
  app.delete('/api/datavault/databases/:id', deleteLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      await datavaultDatabasesService.deleteDatabase(id, tenantId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error deleting DataVault database');
      const message = error instanceof Error ? error.message : 'Failed to delete database';
      const status = message.includes('not found') ? 404 : message.includes('Unauthorized') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/datavault/databases/:id/tables
   * Get all tables in a database
   */
  app.get('/api/datavault/databases/:id/tables', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const tables = await datavaultDatabasesService.getTablesInDatabase(id, tenantId);
      res.json(tables);
    } catch (error) {
      logger.error({ error }, 'Error fetching database tables');
      const message = error instanceof Error ? error.message : 'Failed to fetch tables';
      const status = message.includes('not found') ? 404 : message.includes('Unauthorized') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  // ===================================================================
  // TABLE ENDPOINTS
  // ===================================================================

  /**
   * GET /api/datavault/tables
   * List all tables for the authenticated tenant
   */
  app.get('/api/datavault/tables', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const withStats = req.query.stats === 'true';

      const tables = withStats
        ? await datavaultTablesService.listTablesWithStats(tenantId)
        : await datavaultTablesService.listTables(tenantId);

      res.json(tables);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault tables');
      const message = error instanceof Error ? error.message : 'Failed to fetch tables';
      res.status(500).json({ message });
    }
  });

  /**
   * POST /api/datavault/tables
   * Create a new table
   */
  app.post('/api/datavault/tables', createLimiter, hybridAuth, async (req: Request, res: Response) => {
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
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create table';
      res.status(500).json({ message });
    }
  });

  /**
   * GET /api/datavault/tables/:tableId
   * Get a single table with optional columns
   * Requires: read permission
   */
  app.get('/api/datavault/tables/:tableId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;
      const includeColumns = req.query.columns === 'true';

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Check read permission
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'read');

      const table = includeColumns
        ? await datavaultTablesService.getTableWithColumns(tableId, tenantId)
        : await datavaultTablesService.getTable(tableId, tenantId);

      res.json(table);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault table');
      const message = error instanceof Error ? error.message : 'Failed to fetch table';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PATCH /api/datavault/tables/:tableId
   * Update a table
   * Requires: owner permission
   */
  app.patch('/api/datavault/tables/:tableId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
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
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to update table';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PATCH /api/datavault/tables/:tableId/move
   * Move table to a database or main folder
   */
  app.patch('/api/datavault/tables/:tableId/move', hybridAuth, async (req: Request, res: Response) => {
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
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to move table';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/datavault/tables/:tableId
   * Delete a table (cascades to columns, rows, and values)
   * Requires: owner permission
   */
  app.delete('/api/datavault/tables/:tableId', deleteLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Check owner permission
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'owner');

      await datavaultTablesService.deleteTable(tableId, tenantId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error deleting DataVault table');
      const message = error instanceof Error ? error.message : 'Failed to delete table';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/datavault/tables/:tableId/schema
   * Get table schema (for workflow builder integration)
   * Returns: { id, name, slug, description, databaseId, columns: [...] }
   * Requires: read permission
   */
  app.get('/api/datavault/tables/:tableId/schema', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Check read permission
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'read');

      const schema = await datavaultTablesService.getTableSchema(tableId, tenantId);
      res.json(schema);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault table schema');
      const message = error instanceof Error ? error.message : 'Failed to fetch table schema';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  // ===================================================================
  // COLUMN ENDPOINTS
  // ===================================================================

  /**
   * GET /api/datavault/tables/:tableId/columns
   * List all columns for a table
   */
  app.get('/api/datavault/tables/:tableId/columns', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { tableId } = req.params;

      const columns = await datavaultColumnsService.listColumns(tableId, tenantId);
      res.json(columns);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault columns');
      const message = error instanceof Error ? error.message : 'Failed to fetch columns';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * POST /api/datavault/tables/:tableId/columns
   * Create a new column
   * Requires: owner permission
   */
  app.post('/api/datavault/tables/:tableId/columns', createLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Check owner permission
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'owner');

      const columnData = insertDatavaultColumnSchema.parse({
        ...req.body,
        tableId,
      });

      const column = await datavaultColumnsService.createColumn(columnData, tenantId);
      res.status(201).json(column);
    } catch (error) {
      logger.error({ error }, 'Error creating DataVault column');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create column';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PATCH /api/datavault/columns/:columnId
   * Update a column (name only - type changes not allowed)
   */
  app.patch('/api/datavault/columns/:columnId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { columnId } = req.params;

      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        slug: z.string().min(1).optional(),
        required: z.boolean().optional(),
        orderIndex: z.number().int().optional(),
      });

      const updateData = updateSchema.parse(req.body);

      const column = await datavaultColumnsService.updateColumn(columnId, tenantId, updateData);
      res.json(column);
    } catch (error) {
      logger.error({ error }, 'Error updating DataVault column');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to update column';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/datavault/columns/:columnId
   * Delete a column (cascades to all values)
   */
  app.delete('/api/datavault/columns/:columnId', deleteLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { columnId } = req.params;

      await datavaultColumnsService.deleteColumn(columnId, tenantId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error deleting DataVault column');
      const message = error instanceof Error ? error.message : 'Failed to delete column';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * POST /api/datavault/tables/:tableId/columns/reorder
   * Reorder columns for a table
   */
  app.post('/api/datavault/tables/:tableId/columns/reorder', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { tableId } = req.params;

      const reorderSchema = z.object({
        columnIds: z.array(z.string().uuid()),
      });

      const { columnIds } = reorderSchema.parse(req.body);

      await datavaultColumnsService.reorderColumns(tableId, tenantId, columnIds);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error reordering DataVault columns');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to reorder columns';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  // ===================================================================
  // ROW ENDPOINTS
  // ===================================================================

  /**
   * POST /api/datavault/references/batch
   * Batch resolve reference values (fixes N+1 query problem)
   * Body: { requests: [{ tableId, rowIds[], displayColumnSlug? }] }
   */
  app.post('/api/datavault/references/batch', batchLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);

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

      const resultMap = await datavaultRowsService.batchResolveReferences(requests, tenantId);

      // Convert Map to object for JSON serialization
      const result: Record<string, { displayValue: string; row: any }> = {};
      resultMap.forEach((value, key) => {
        result[key] = value;
      });

      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Error batch resolving references');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to resolve references';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

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
  app.get('/api/datavault/tables/:tableId/rows', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Check read permission
      await datavaultTablesService.requirePermission(userId, tableId, tenantId, 'read');

      const limit = req.query.limit
        ? Math.min(parseInt(req.query.limit as string, 10), DATAVAULT_CONFIG.MAX_PAGE_SIZE)
        : DATAVAULT_CONFIG.DEFAULT_PAGE_SIZE;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
      const showArchived = req.query.showArchived === 'true';
      const sortBy = req.query.sortBy as string | undefined;
      const sortOrder = (req.query.sortOrder === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';

      // Use new getRowsWithOptions method that supports archiving and sorting
      const result = await datavaultRowsService.getRowsWithOptions(
        tenantId,
        tableId,
        { limit, offset, showArchived, sortBy, sortOrder }
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
      const message = error instanceof Error ? error.message : 'Failed to fetch rows';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * POST /api/datavault/tables/:tableId/rows
   * Create a new row with values
   * Requires: write permission
   */
  app.post('/api/datavault/tables/:tableId/rows', strictLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
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
      if (error instanceof Error) console.log('Row creation error message:', error.message);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create row';
      const status = message.includes('not found') ? 404 :
        message.includes('Access denied') ? 403 :
          message.includes('not a valid option') || message.includes('missing') || message.includes('Required') ? 400 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/datavault/rows/:rowId
   * Get a single row with all its values
   */
  app.get('/api/datavault/rows/:rowId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { rowId } = req.params;

      const row = await datavaultRowsService.getRow(rowId, tenantId);

      if (!row) {
        return res.status(404).json({ message: 'Row not found' });
      }

      res.json(row);
    } catch (error) {
      logger.error({ error }, 'Error fetching DataVault row');
      const message = error instanceof Error ? error.message : 'Failed to fetch row';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PATCH /api/datavault/rows/:rowId
   * Update a row's values
   * Requires: write permission
   */
  app.patch('/api/datavault/rows/:rowId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { rowId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Get row to determine tableId for permission check
      const rowData = await datavaultRowsService.getRow(rowId, tenantId);
      if (!rowData) {
        return res.status(404).json({ message: 'Row not found' });
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
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to update row';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/datavault/rows/:rowId/references
   * Check if row is referenced by other rows
   * Returns list of tables/columns that reference this row
   */
  app.get('/api/datavault/rows/:rowId/references', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { rowId } = req.params;

      const references = await datavaultRowsService.getRowReferences(rowId, tenantId);
      res.json({
        rowId,
        isReferenced: references.length > 0,
        references,
        totalReferences: references.reduce((sum, ref) => sum + ref.referenceCount, 0)
      });
    } catch (error) {
      logger.error({ error }, 'Error checking row references');
      const message = error instanceof Error ? error.message : 'Failed to check references';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/datavault/rows/:rowId
   * Delete a row and all its values
   * Note: References to this row will be automatically set to NULL by database trigger
   * Requires: write permission
   */
  app.delete('/api/datavault/rows/:rowId', deleteLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { rowId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Get row to determine tableId for permission check
      const rowData = await datavaultRowsService.getRow(rowId, tenantId);
      if (!rowData) {
        return res.status(404).json({ message: 'Row not found' });
      }

      // Check write permission
      await datavaultTablesService.requirePermission(userId, rowData.row.tableId, tenantId, 'write');

      await datavaultRowsService.deleteRow(rowId, tenantId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error deleting DataVault row');
      const message = error instanceof Error ? error.message : 'Failed to delete row';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  // ===================================================================
  // ROW ARCHIVING ENDPOINTS (DataVault v3)
  // ===================================================================

  /**
   * PATCH /api/datavault/rows/:rowId/archive
   * Archive (soft delete) a row
   */
  app.patch('/api/datavault/rows/:rowId/archive', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { rowId } = req.params;

      await datavaultRowsService.archiveRow(tenantId, rowId);
      res.json({ success: true, message: 'Row archived successfully' });
    } catch (error) {
      logger.error({ error }, 'Error archiving DataVault row');
      const message = error instanceof Error ? error.message : 'Failed to archive row';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PATCH /api/datavault/rows/:rowId/unarchive
   * Unarchive (restore) a row
   */
  app.patch('/api/datavault/rows/:rowId/unarchive', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { rowId } = req.params;

      await datavaultRowsService.unarchiveRow(tenantId, rowId);
      res.json({ success: true, message: 'Row unarchived successfully' });
    } catch (error) {
      logger.error({ error }, 'Error unarchiving DataVault row');
      const message = error instanceof Error ? error.message : 'Failed to unarchive row';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PATCH /api/datavault/rows/bulk/archive
   * Bulk archive rows
   * Body: { rowIds: string[] }
   */
  app.patch('/api/datavault/rows/bulk/archive', batchLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);

      const schema = z.object({
        rowIds: z.array(z.string().uuid()).min(1).max(100),
      });

      const { rowIds } = schema.parse(req.body);

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
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to archive rows';
      const status = message.includes('not found') || message.includes('unauthorized') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PATCH /api/datavault/rows/bulk/unarchive
   * Bulk unarchive rows
   * Body: { rowIds: string[] }
   */
  app.patch('/api/datavault/rows/bulk/unarchive', batchLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);

      const schema = z.object({
        rowIds: z.array(z.string().uuid()).min(1).max(100),
      });

      const { rowIds } = schema.parse(req.body);

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
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to unarchive rows';
      const status = message.includes('not found') || message.includes('unauthorized') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  // ===================================================================
  // ROW NOTES ENDPOINTS (v4 Micro-Phase 3)
  // ===================================================================

  /**
   * GET /api/datavault/rows/:rowId/notes
   * Get all notes for a row
   */
  app.get('/api/datavault/rows/:rowId/notes', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { rowId } = req.params;

      const notes = await datavaultRowNotesService.getNotesByRowId(rowId, tenantId);
      res.json(notes);
    } catch (error) {
      logger.error({ error }, 'Error fetching row notes');
      const message = error instanceof Error ? error.message : 'Failed to fetch notes';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * POST /api/datavault/rows/:rowId/notes
   * Create a new note for a row
   * Body: { text: string }
   */
  app.post('/api/datavault/rows/:rowId/notes', createLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { rowId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const schema = z.object({
        text: z.string()
          .min(1, { message: 'Note text cannot be empty' })
          .max(10000, { message: 'Note text is too long (max 10000 characters)' }),
      });

      const { text } = schema.parse(req.body);

      const note = await datavaultRowNotesService.createNote(rowId, tenantId, userId, text);
      res.status(201).json(note);
    } catch (error) {
      logger.error({ error }, 'Error creating row note');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create note';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/datavault/notes/:noteId
   * Delete a note
   * Only the note owner or table owner may delete
   */
  app.delete('/api/datavault/notes/:noteId', deleteLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { noteId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      await datavaultRowNotesService.deleteNote(noteId, tenantId, userId);
      res.json({ success: true, message: 'Note deleted successfully' });
    } catch (error) {
      logger.error({ error }, 'Error deleting row note');
      const message = error instanceof Error ? error.message : 'Failed to delete note';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  // ===================================================================
  // TABLE PERMISSIONS ENDPOINTS (v4 Micro-Phase 6)
  // ===================================================================

  /**
   * GET /api/datavault/tables/:tableId/permissions
   * Get all permissions for a table (owner only)
   */
  app.get('/api/datavault/tables/:tableId/permissions', hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getAuthUserId(req);
      const { tableId } = req.params;

      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const permissions = await datavaultTablePermissionsService.getTablePermissions(
        userId,
        tableId,
        tenantId
      );

      res.json(permissions);
    } catch (error) {
      logger.error({ error }, 'Error fetching table permissions');
      const message = error instanceof Error ? error.message : 'Failed to fetch permissions';
      const status = message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * POST /api/datavault/tables/:tableId/permissions
   * Grant or update permission for a user (owner only)
   * Body: { userId: string, role: 'owner' | 'write' | 'read' }
   */
  app.post('/api/datavault/tables/:tableId/permissions', createLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const actorUserId = getAuthUserId(req);
      const { tableId } = req.params;

      if (!actorUserId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      // Validate request body
      const permissionSchema = z.object({
        userId: z.string().min(1, { message: 'User ID is required' }),
        role: z.enum(['owner', 'write', 'read'], {
          errorMap: () => ({ message: 'Role must be owner, write, or read' })
        }),
      });

      const data = permissionSchema.parse(req.body);

      const permission = await datavaultTablePermissionsService.grantPermission(
        actorUserId,
        tableId,
        tenantId,
        {
          tableId,
          userId: data.userId,
          role: data.role,
        }
      );

      console.log('Grant permission success, sending 201. Permission:', JSON.stringify(permission));
      res.status(201).json(permission);
    } catch (error) {
      console.log('Grant permission catch block entered', error);
      logger.error({ error }, 'Error granting table permission');
      const message = error instanceof Error ? error.message : 'Failed to grant permission';

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Validation error',
          errors: error.errors
        });
      }

      const status = message.includes('Access denied') ? 403 :
        message.includes('not found') ? 404 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/datavault/permissions/:permissionId
   * Revoke a permission (owner only)
   * Query param: tableId (required for authorization)
   */
  app.delete('/api/datavault/permissions/:permissionId', deleteLimiter, hybridAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const actorUserId = getAuthUserId(req);
      const { permissionId } = req.params;
      const { tableId } = req.query;

      if (!actorUserId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      if (!tableId || typeof tableId !== 'string') {
        return res.status(400).json({ message: 'Table ID query parameter is required' });
      }

      await datavaultTablePermissionsService.revokePermission(
        actorUserId,
        permissionId,
        tableId,
        tenantId
      );

      res.json({ success: true, message: 'Permission revoked successfully' });
    } catch (error) {
      logger.error({ error }, 'Error revoking table permission');
      const message = error instanceof Error ? error.message : 'Failed to revoke permission';
      const status = message.includes('Access denied') ? 403 :
        message.includes('not found') ? 404 : 500;
      res.status(status).json({ message });
    }
  });
}
