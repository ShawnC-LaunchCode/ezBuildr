import { apiLimiter } from '../middleware/rateLimiter';

import { registerDatavaultColumnRoutes } from './datavault/columns.routes';
import { registerDatavaultDatabaseRoutes } from './datavault/databases.routes';
import { registerDatavaultOptionRoutes } from './datavault/options.routes';
import { registerDatavaultPermissionRoutes } from './datavault/permissions.routes';
import { registerDatavaultRowArchiveRoutes } from './datavault/rowArchive.routes';
import { registerDatavaultRowNoteRoutes } from './datavault/rowNotes.routes';
import { registerDatavaultRowRoutes } from './datavault/rows.routes';
import { registerDatavaultTableRoutes } from './datavault/tables.routes';

import type { Express } from 'express';

/**
 * Register DataVault routes
 * DataVault Phase 1: Tenant-scoped custom data tables
 *
 * DataVault provides a flexible data storage system where creators can define
 * custom tables, columns, and manage data without altering the database schema.
 *
 * Endpoints are grouped into cohesive modules under ./datavault/ (databases,
 * tables, columns, rows, row archiving, row notes, table permissions).
 */
export function registerDatavaultRoutes(app: Express): void {
  // Apply global rate limiting to all DataVault routes
  app.use('/api/datavault', apiLimiter);
  registerDatavaultDatabaseRoutes(app);
  registerDatavaultTableRoutes(app);
  registerDatavaultColumnRoutes(app);
  registerDatavaultOptionRoutes(app);
  registerDatavaultRowRoutes(app);
  registerDatavaultRowArchiveRoutes(app);
  registerDatavaultRowNoteRoutes(app);
  registerDatavaultPermissionRoutes(app);
}
