import { z } from 'zod';

import { insertCollectionSchema, insertCollectionFieldSchema, insertRecordSchema } from '@shared/schema';

import { logger } from '../logger';
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { collectionFieldService } from '../services/CollectionFieldService';
import { collectionService } from '../services/CollectionService';
import { recordService } from '../services/RecordService';



import type { Express, Request, Response } from 'express';

/**
 * Register collections/datastore routes
 * Stage 19: Collections/Datastore System
 *
 * Collections are tenant-scoped data tables similar to Airtable bases
 */
export function registerCollectionsRoutes(app: Express): void {
  // ===================================================================
  // COLLECTION ENDPOINTS
  // ===================================================================

  /**
   * GET /api/tenants/:tenantId/collections
   * List all collections for a tenant
   */
  app.get('/api/tenants/:tenantId/collections', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;
      const withStats = req.query.stats === 'true';

      const collections = withStats
        ? await collectionService.listCollectionsWithStats(tenantId)
        : await collectionService.listCollections(tenantId);

      res.json(collections);
    } catch (error) {
      logger.error({ error }, 'Error fetching collections');
      res.status(500).json({ message: 'Failed to fetch collections' });
    }
  });

  /**
   * POST /api/tenants/:tenantId/collections
   * Create a new collection
   */
  app.post('/api/tenants/:tenantId/collections', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;

      const collectionData = insertCollectionSchema.parse({
        ...req.body,
        tenantId,
      });

      const collection = await collectionService.createCollection(collectionData);
      res.status(201).json(collection);
    } catch (error) {
      logger.error({ error }, 'Error creating collection');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create collection';
      res.status(500).json({ message });
    }
  });

  /**
   * GET /api/tenants/:tenantId/collections/:collectionId
   * Get a single collection with optional fields
   */
  app.get('/api/tenants/:tenantId/collections/:collectionId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId } = req.params;
      const includeFields = req.query.fields === 'true';

      const collection = includeFields
        ? await collectionService.getCollectionWithFields(collectionId, tenantId)
        : await collectionService.getCollection(collectionId, tenantId);

      res.json(collection);
    } catch (error) {
      logger.error({ error }, 'Error fetching collection');
      const message = error instanceof Error ? error.message : 'Failed to fetch collection';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/tenants/:tenantId/collections/slug/:slug
   * Get collection by slug
   */
  app.get('/api/tenants/:tenantId/collections/slug/:slug', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, slug } = req.params;

      const collection = await collectionService.getCollectionBySlug(tenantId, slug);

      if (!collection) {
        return res.status(404).json({ message: 'Collection not found' });
      }

      res.json(collection);
    } catch (error) {
      logger.error({ error }, 'Error fetching collection by slug');
      res.status(500).json({ message: 'Failed to fetch collection' });
    }
  });

  /**
   * PATCH /api/tenants/:tenantId/collections/:collectionId
   * Update a collection
   */
  app.patch('/api/tenants/:tenantId/collections/:collectionId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId } = req.params;

      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        slug: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
      });

      const updateData = updateSchema.parse(req.body);

      const collection = await collectionService.updateCollection(collectionId, tenantId, updateData);
      res.json(collection);
    } catch (error) {
      logger.error({ error }, 'Error updating collection');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to update collection';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/tenants/:tenantId/collections/:collectionId
   * Delete a collection (cascades to fields and records)
   */
  app.delete('/api/tenants/:tenantId/collections/:collectionId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId } = req.params;

      await collectionService.deleteCollection(collectionId, tenantId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error deleting collection');
      const message = error instanceof Error ? error.message : 'Failed to delete collection';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  // ===================================================================
  // COLLECTION FIELD ENDPOINTS
  // ===================================================================

  /**
   * GET /api/tenants/:tenantId/collections/:collectionId/fields
   * List all fields in a collection
   */
  app.get('/api/tenants/:tenantId/collections/:collectionId/fields', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId } = req.params;

      // Verify collection ownership first
      await collectionService.verifyTenantOwnership(collectionId, tenantId);

      const fields = await collectionFieldService.listFields(collectionId);
      res.json(fields);
    } catch (error) {
      logger.error({ error }, 'Error fetching fields');
      const message = error instanceof Error ? error.message : 'Failed to fetch fields';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * POST /api/tenants/:tenantId/collections/:collectionId/fields
   * Create a new field in a collection
   */
  app.post('/api/tenants/:tenantId/collections/:collectionId/fields', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId } = req.params;

      // Verify collection ownership first
      await collectionService.verifyTenantOwnership(collectionId, tenantId);

      const fieldData = insertCollectionFieldSchema.parse({
        ...req.body,
        collectionId,
      });

      const field = await collectionFieldService.createField(fieldData);
      res.status(201).json(field);
    } catch (error) {
      logger.error({ error }, 'Error creating field');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create field';
      const status = message.includes('not found') ? 404 : message.includes('requires options') || message.includes('must be') ? 400 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * POST /api/tenants/:tenantId/collections/:collectionId/fields/bulk
   * Bulk create fields in a collection
   */
  app.post('/api/tenants/:tenantId/collections/:collectionId/fields/bulk', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId } = req.params;

      // Verify collection ownership first
      await collectionService.verifyTenantOwnership(collectionId, tenantId);

      const bulkSchema = z.object({
        fields: z.array(insertCollectionFieldSchema.omit({ collectionId: true })),
      });

      const { fields: fieldsData } = bulkSchema.parse(req.body);

      const fields = await collectionFieldService.bulkCreateFields(collectionId, fieldsData as any);
      res.status(201).json(fields);
    } catch (error) {
      logger.error({ error }, 'Error bulk creating fields');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create fields';
      res.status(500).json({ message });
    }
  });

  /**
   * GET /api/tenants/:tenantId/collections/:collectionId/fields/:fieldId
   * Get a single field
   */
  app.get('/api/tenants/:tenantId/collections/:collectionId/fields/:fieldId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId, fieldId } = req.params;

      // Verify collection ownership first
      await collectionService.verifyTenantOwnership(collectionId, tenantId);

      const field = await collectionFieldService.getField(fieldId);

      if (!field) {
        return res.status(404).json({ message: 'Field not found' });
      }

      // Verify field belongs to collection
      if (field.collectionId !== collectionId) {
        return res.status(403).json({ message: 'Field belongs to different collection' });
      }

      res.json(field);
    } catch (error) {
      logger.error({ error }, 'Error fetching field');
      const message = error instanceof Error ? error.message : 'Failed to fetch field';
      res.status(500).json({ message });
    }
  });

  /**
   * PATCH /api/tenants/:tenantId/collections/:collectionId/fields/:fieldId
   * Update a field
   */
  app.patch('/api/tenants/:tenantId/collections/:collectionId/fields/:fieldId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId, fieldId } = req.params;

      // Verify collection ownership first
      await collectionService.verifyTenantOwnership(collectionId, tenantId);

      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        slug: z.string().min(1).optional(),
        isRequired: z.boolean().optional(),
        options: z.any().optional(),
        defaultValue: z.any().optional(),
      });

      const updateData = updateSchema.parse(req.body);

      const field = await collectionFieldService.updateField(fieldId, collectionId, updateData);
      res.json(field);
    } catch (error) {
      logger.error({ error }, 'Error updating field');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to update field';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : message.includes('must be') ? 400 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/tenants/:tenantId/collections/:collectionId/fields/:fieldId
   * Delete a field
   */
  app.delete('/api/tenants/:tenantId/collections/:collectionId/fields/:fieldId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId, fieldId } = req.params;

      // Verify collection ownership first
      await collectionService.verifyTenantOwnership(collectionId, tenantId);

      await collectionFieldService.deleteField(fieldId, collectionId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error deleting field');
      const message = error instanceof Error ? error.message : 'Failed to delete field';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  // ===================================================================
  // RECORD ENDPOINTS
  // ===================================================================

  /**
   * GET /api/tenants/:tenantId/collections/:collectionId/records
   * List records in a collection with pagination
   */
  app.get('/api/tenants/:tenantId/collections/:collectionId/records', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId } = req.params;

      // SECURITY FIX: Validate pagination parameters properly (no NaN from parseInt)
      const { paginationSchema } = await import('../utils/validation');
      const pagination = paginationSchema.partial().parse({
        limit: req.query.limit,
        offset: req.query.offset,
      });

      const orderBy = (req.query.orderBy as 'created_at' | 'updated_at') || 'created_at';
      const order = (req.query.order as 'asc' | 'desc') || 'desc';

      const records = await recordService.listRecords(collectionId, tenantId, {
        limit: pagination.limit,
        offset: pagination.offset,
        orderBy,
        order,
      });

      // Also return count if requested
      if (req.query.includeCount === 'true') {
        const count = await recordService.countRecords(collectionId, tenantId);
        return res.json({ records, count });
      }

      res.json(records);
    } catch (error) {
      logger.error({ error }, 'Error fetching records');
      const message = error instanceof Error ? error.message : 'Failed to fetch records';
      const status = message.includes('not found') || message.includes('access denied') ? 404 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * POST /api/tenants/:tenantId/collections/:collectionId/records
   * Create a new record
   */
  app.post('/api/tenants/:tenantId/collections/:collectionId/records', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId } = req.params;
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      const recordData = insertRecordSchema.parse({
        tenantId,
        collectionId,
        data: req.body.data || req.body, // Support both {data: {...}} and direct {...}
      });

      const record = await recordService.createRecord(recordData, userId);
      res.status(201).json(record);
    } catch (error) {
      logger.error({ error }, 'Error creating record');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create record';
      const status = message.includes('Required field') || message.includes('must be') || message.includes('Unknown field') ? 400 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * POST /api/tenants/:tenantId/collections/:collectionId/records/bulk
   * Bulk create records
   */
  app.post('/api/tenants/:tenantId/collections/:collectionId/records/bulk', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId } = req.params;
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      const bulkSchema = z.object({
        records: z.array(z.record(z.any())),
      });

      const { records: recordsData } = bulkSchema.parse(req.body);

      const records = await recordService.bulkCreateRecords(collectionId, tenantId, recordsData, userId);
      res.status(201).json(records);
    } catch (error) {
      logger.error({ error }, 'Error bulk creating records');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to create records';
      res.status(500).json({ message });
    }
  });

  /**
   * POST /api/tenants/:tenantId/collections/:collectionId/records/query
   * Query records by JSONB filters
   */
  app.post('/api/tenants/:tenantId/collections/:collectionId/records/query', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId } = req.params;

      const querySchema = z.object({
        filters: z.record(z.any()),
      });

      const { filters } = querySchema.parse(req.body);

      const records = await recordService.findRecordsByFilters(collectionId, tenantId, filters);
      res.json(records);
    } catch (error) {
      logger.error({ error }, 'Error querying records');

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: 'Invalid input',
          errors: error.errors,
        });
      }

      const message = error instanceof Error ? error.message : 'Failed to query records';
      res.status(500).json({ message });
    }
  });

  /**
   * GET /api/tenants/:tenantId/collections/:collectionId/records/:recordId
   * Get a single record
   */
  app.get('/api/tenants/:tenantId/collections/:collectionId/records/:recordId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, recordId } = req.params;

      const record = await recordService.getRecord(recordId, tenantId);
      res.json(record);
    } catch (error) {
      logger.error({ error }, 'Error fetching record');
      const message = error instanceof Error ? error.message : 'Failed to fetch record';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * PATCH /api/tenants/:tenantId/collections/:collectionId/records/:recordId
   * Update a record
   */
  app.patch('/api/tenants/:tenantId/collections/:collectionId/records/:recordId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, recordId } = req.params;
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      // Updates can be partial field updates
      const updates = req.body.data || req.body; // Support both {data: {...}} and direct {...}

      const record = await recordService.updateRecord(recordId, tenantId, updates, userId);
      res.json(record);
    } catch (error) {
      logger.error({ error }, 'Error updating record');

      const message = error instanceof Error ? error.message : 'Failed to update record';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : message.includes('must be') || message.includes('Unknown field') ? 400 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * DELETE /api/tenants/:tenantId/collections/:collectionId/records/:recordId
   * Delete a record
   */
  app.delete('/api/tenants/:tenantId/collections/:collectionId/records/:recordId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, recordId } = req.params;

      await recordService.deleteRecord(recordId, tenantId);
      res.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Error deleting record');
      const message = error instanceof Error ? error.message : 'Failed to delete record';
      const status = message.includes('not found') ? 404 : message.includes('Access denied') ? 403 : 500;
      res.status(status).json({ message });
    }
  });

  /**
   * GET /api/tenants/:tenantId/collections/:collectionId/records/count
   * Count records in a collection
   */
  app.get('/api/tenants/:tenantId/collections/:collectionId/records/count', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { tenantId, collectionId } = req.params;

      const count = await recordService.countRecords(collectionId, tenantId);
      res.json({ count });
    } catch (error) {
      logger.error({ error }, 'Error counting records');
      res.status(500).json({ message: 'Failed to count records' });
    }
  });
}
