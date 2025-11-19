import { Router } from 'express';
import { datavaultDatabasesService } from '../services/DatavaultDatabasesService';
import { requireAuth } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

const datavaultScopeTypeSchema = z.enum(['account', 'project', 'workflow']);

const createDatabaseSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  scopeType: datavaultScopeTypeSchema,
  scopeId: z.string().uuid().optional(),
}).refine(
  (data) => {
    if (data.scopeType === 'account' && data.scopeId) {
      return false;
    }
    if ((data.scopeType === 'project' || data.scopeType === 'workflow') && !data.scopeId) {
      return false;
    }
    return true;
  },
  {
    message: 'Invalid scope configuration',
  }
);

const updateDatabaseSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  scopeType: datavaultScopeTypeSchema.optional(),
  scopeId: z.string().uuid().optional().nullable(),
}).refine(
  (data) => {
    if (data.scopeType === 'account' && data.scopeId) {
      return false;
    }
    if ((data.scopeType === 'project' || data.scopeType === 'workflow') && !data.scopeId) {
      return false;
    }
    return true;
  },
  {
    message: 'Invalid scope configuration',
  }
);

const getDatabasesQuerySchema = z.object({
  scopeType: datavaultScopeTypeSchema.optional(),
  scopeId: z.string().uuid().optional(),
});

/**
 * GET /api/datavault/databases
 * Get all databases for current tenant (optionally filtered by scope)
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;

    const query = getDatabasesQuerySchema.parse(req.query);

    let databases;
    if (query.scopeType) {
      databases = await datavaultDatabasesService.getDatabasesByScope(
        tenantId,
        query.scopeType,
        query.scopeId
      );
    } else {
      databases = await datavaultDatabasesService.getDatabasesForTenant(tenantId);
    }

    res.json(databases);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/datavault/databases
 * Create a new database
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const input = createDatabaseSchema.parse(req.body);

    const database = await datavaultDatabasesService.createDatabase({
      ...input,
      tenantId,
    });

    res.status(201).json(database);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/datavault/databases/:id
 * Get database by ID with stats
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const database = await datavaultDatabasesService.getDatabaseById(id, tenantId);

    res.json(database);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/datavault/databases/:id
 * Update database
 */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const input = updateDatabaseSchema.parse(req.body);

    const database = await datavaultDatabasesService.updateDatabase(
      id,
      tenantId,
      input
    );

    res.json(database);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/datavault/databases/:id
 * Delete database (tables will be orphaned but not deleted)
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    await datavaultDatabasesService.deleteDatabase(id, tenantId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/datavault/databases/:id/tables
 * Get all tables in a database
 */
router.get('/:id/tables', requireAuth, async (req, res, next) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const tables = await datavaultDatabasesService.getTablesInDatabase(id, tenantId);

    res.json(tables);
  } catch (error) {
    next(error);
  }
});

export default router;
