import type { Express, Request, Response } from 'express';
import { isAuthenticated } from '../googleAuth';
import {
  insertDatavaultTableSchema,
  insertDatavaultColumnSchema,
  insertDatavaultRowSchema,
} from '@shared/schema';
import {
  datavaultTablesService,
  datavaultColumnsService,
  datavaultRowsService,
} from '../services';
import { datavaultDatabasesService } from '../services/DatavaultDatabasesService';
import { z } from 'zod';
import { logger } from '../logger';

/**
 * Register DataVault routes
 * DataVault Phase 1: Tenant-scoped custom data tables
 *
 * DataVault provides a flexible data storage system where creators can define
 * custom tables, columns, and manage data without altering the database schema.
 */
export function registerDatavaultRoutes(app: Express): void {
  // Helper to get tenantId from authenticated user
  const getTenantId = (req: Request): string => {
    const tenantId = (req.user as any)?.tenantId;
    if (!tenantId) {
      logger.error(
        {
          userId: (req.user as any)?.id,
          email: (req.user as any)?.email
        },
        'User session missing tenantId - user may need to log out and log back in'
      );
      throw new Error('Your account is not properly configured. Please log out and log back in to fix this issue.');
    }
    return tenantId;
  };

  const getUserId = (req: Request): string | undefined => {
    return (req.user as any)?.id;
  };

  // ===================================================================
  // DATABASE ENDPOINTS
  // ===================================================================

  /**
   * GET /api/datavault/databases
   * List all databases for the authenticated tenant
   */
  app.get('/api/datavault/databases', isAuthenticated, async (req: Request, res: Response) => {
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
  app.post('/api/datavault/databases', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);

      const createSchema = z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        scopeType: z.enum(['account', 'project', 'workflow']),
        scopeId: z.string().uuid().optional(),
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
  app.get('/api/datavault/databases/:id', isAuthenticated, async (req: Request, res: Response) => {
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
  app.patch('/api/datavault/databases/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const updateSchema = z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        scopeType: z.enum(['account', 'project', 'workflow']).optional(),
        scopeId: z.string().uuid().optional().nullable(),
      });

      const input = updateSchema.parse(req.body);
      const database = await datavaultDatabasesService.updateDatabase(id, tenantId, input);

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
  app.delete('/api/datavault/databases/:id', isAuthenticated, async (req: Request, res: Response) => {
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
  app.get('/api/datavault/databases/:id/tables', isAuthenticated, async (req: Request, res: Response) => {
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
  app.get('/api/datavault/tables', isAuthenticated, async (req: Request, res: Response) => {
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
  app.post('/api/datavault/tables', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

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
   */
  app.get('/api/datavault/tables/:tableId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { tableId } = req.params;
      const includeColumns = req.query.columns === 'true';

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
   */
  app.patch('/api/datavault/tables/:tableId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { tableId } = req.params;

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
   * DELETE /api/datavault/tables/:tableId
   * Delete a table (cascades to columns, rows, and values)
   */
  app.delete('/api/datavault/tables/:tableId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { tableId } = req.params;

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
   */
  app.get('/api/datavault/tables/:tableId/schema', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { tableId } = req.params;

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
  app.get('/api/datavault/tables/:tableId/columns', isAuthenticated, async (req: Request, res: Response) => {
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
   */
  app.post('/api/datavault/tables/:tableId/columns', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { tableId } = req.params;

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
  app.patch('/api/datavault/columns/:columnId', isAuthenticated, async (req: Request, res: Response) => {
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
  app.delete('/api/datavault/columns/:columnId', isAuthenticated, async (req: Request, res: Response) => {
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
  app.post('/api/datavault/tables/:tableId/columns/reorder', isAuthenticated, async (req: Request, res: Response) => {
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
   * GET /api/datavault/tables/:tableId/rows
   * List all rows for a table with pagination
   */
  app.get('/api/datavault/tables/:tableId/rows', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { tableId } = req.params;

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

      const rows = await datavaultRowsService.listRows(tableId, tenantId, { limit, offset });
      const totalCount = await datavaultRowsService.countRows(tableId, tenantId);

      res.json({
        rows,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore: offset + rows.length < totalCount,
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
   */
  app.post('/api/datavault/tables/:tableId/rows', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { tableId } = req.params;

      const rowSchema = z.object({
        values: z.record(z.string(), z.any()), // columnId -> value
      });

      const { values } = rowSchema.parse(req.body);

      const result = await datavaultRowsService.createRow(tableId, tenantId, values, userId);
      res.status(201).json(result);
    } catch (error) {
      logger.error({ error }, 'Error creating DataVault row');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create row';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/datavault/rows/:rowId
   * Get a single row with all its values
   */
  app.get('/api/datavault/rows/:rowId', isAuthenticated, async (req: Request, res: Response) => {
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
   */
  app.patch('/api/datavault/rows/:rowId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { rowId } = req.params;

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
   * DELETE /api/datavault/rows/:rowId
   * Delete a row and all its values
   */
  app.delete('/api/datavault/rows/:rowId', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { rowId } = req.params;

      await datavaultRowsService.deleteRow(rowId, tenantId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error deleting DataVault row');
      const message = error instanceof Error ? error.message : 'Failed to delete row';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });
}
