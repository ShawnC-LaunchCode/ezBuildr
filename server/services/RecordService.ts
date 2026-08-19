import type { CollectionRecord, InsertRecord, CollectionField } from "@shared/schema";

import {
  recordRepository,
  collectionRepository,
  collectionFieldRepository,
  type DbTransaction,
} from "../repositories";
import { withCurrentTenant, getCurrentTenantId } from "../utils/rlsContext";

/**
 * Service layer for record business logic
 * Records are rows in collections with validated JSONB data
 *
 * RLS-2c: copies the RLS-2a pilot's `withTx` shape (see CollectionService.ts)
 * unmodified. Every public method already carries a `tenantId` argument used
 * by its `eq`/equality predicates (AC3 — those stay), so the same
 * ambient-vs-argument mismatch guard applies here.
 */
export class RecordService {
  private recordRepo: typeof recordRepository;
  private collectionRepo: typeof collectionRepository;
  private fieldRepo: typeof collectionFieldRepository;

  constructor(
    recordRepo?: typeof recordRepository,
    collectionRepo?: typeof collectionRepository,
    fieldRepo?: typeof collectionFieldRepository
  ) {
    this.recordRepo = recordRepo ?? recordRepository;
    this.collectionRepo = collectionRepo ?? collectionRepository;
    this.fieldRepo = fieldRepo ?? collectionFieldRepository;
  }

  /** See CollectionService.withTx for the full rationale — copied unmodified. */
  private async withTx<T>(
    expectedTenantId: string,
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    const ambientTenantId = getCurrentTenantId();
    if (ambientTenantId !== undefined && ambientTenantId !== expectedTenantId) {
      throw new Error(
        `RLS: tenant mismatch — operation requested for tenant "${expectedTenantId}" but the ` +
        `request's async context is tenant "${ambientTenantId}". Refusing to run rather than ` +
        `silently scoping to the wrong tenant.`
      );
    }
    return withCurrentTenant(fn);
  }

  /**
   * Verify collection exists
   */
  private async verifyCollectionExists(collectionId: string, tx?: DbTransaction): Promise<void> {
    const collection = await this.collectionRepo.findById(collectionId, tx);
    if (!collection) {
      throw new Error("Collection not found");
    }
  }

  /**
   * Verify record belongs to tenant and collection
   */
  async verifyRecordOwnership(
    recordId: string,
    tenantId: string,
    collectionId?: string,
    tx?: DbTransaction
  ): Promise<CollectionRecord> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const record = await this.recordRepo.findById(recordId, scopedTx);

      if (!record) {
        throw new Error("Record not found");
      }

      if (record.tenantId !== tenantId) {
        throw new Error("Access denied - record belongs to different tenant");
      }

      if (collectionId && record.collectionId !== collectionId) {
        throw new Error("Access denied - record belongs to different collection");
      }

      return record;
    });
  }

  /**
   * Validate record data against collection fields
   */
  private async validateRecordData(
    collectionId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONB record data can contain any valid JSON value
    data: Record<string, any>,
    tx?: DbTransaction
  ): Promise<void> {
    const fields = await this.fieldRepo.findByCollectionId(collectionId, tx);

    // Check required fields
    for (const field of fields) {
      if (field.isRequired && !(field.slug in data)) {
        throw new Error(`Required field '${field.name}' (${field.slug}) is missing`);
      }
    }

    // Validate field types
    for (const [slug, value] of Object.entries(data)) {
      const field = fields.find((f) => f.slug === slug);

      if (!field) {
        throw new Error(`Unknown field '${slug}' - field does not exist in collection`);
      }

      // Skip validation for null/undefined (allowed for non-required fields)
      if (value === null || value === undefined) {
        continue;
      }

      this.validateFieldValue(field, value);
    }
  }

  /**
   * Validate a single field value
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, sonarjs/cognitive-complexity, complexity
  private validateFieldValue(field: CollectionField, value: any): void {
    switch (field.type) {
      case 'text':
        if (typeof value !== 'string') {
          throw new Error(`Field '${field.name}' must be a string`);
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          throw new Error(`Field '${field.name}' must be a valid number`);
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new Error(`Field '${field.name}' must be a boolean`);
        }
        break;

      case 'date':
      case 'datetime':
        // Accept ISO string or Date object
        if (typeof value !== 'string' && !(value instanceof Date)) {
          throw new Error(`Field '${field.name}' must be a date (ISO string)`);
        }
        // Validate date format
        if (typeof value === 'string' && isNaN(Date.parse(value))) {
          throw new Error(`Field '${field.name}' has invalid date format`);
        }
        break;

      case 'select':
        if (typeof value !== 'string') {
          throw new Error(`Field '${field.name}' must be a string`);
        }
        // Validate against options if provided
        // eslint-disable-next-line sonarjs/no-collapsible-if
        if (field.options && Array.isArray(field.options)) {
          if (!field.options.includes(value)) {
            throw new Error(
              `Field '${field.name}' value '${value}' is not a valid option. Valid options: ${field.options.join(', ')}`
            );
          }
        }
        break;

      case 'multi_select':
        if (!Array.isArray(value)) {
          throw new Error(`Field '${field.name}' must be an array`);
        }
        // Validate against options if provided
        if (field.options && Array.isArray(field.options)) {
          for (const item of value) {
            if (!field.options.includes(item)) {
              throw new Error(
                `Field '${field.name}' value '${item}' is not a valid option. Valid options: ${field.options.join(', ')}`
              );
            }
          }
        }
        break;

      case 'file':
        // File should be a URL string or object with metadata
        if (typeof value !== 'string' && typeof value !== 'object') {
          throw new Error(`Field '${field.name}' must be a file URL or file metadata object`);
        }
        break;

      case 'json':
        // Any valid JSON value is acceptable
        try {
          JSON.stringify(value);
        } catch {
          throw new Error(`Field '${field.name}' contains invalid JSON data`);
        }
        break;

      default:
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Unknown field type '${field.type}'`);
    }
  }

  /**
   * Apply default values to record data
   */

  private async applyDefaults(
    collectionId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONB record data can contain any valid JSON value
    data: Record<string, any>,
    tx?: DbTransaction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONB record data can contain any valid JSON value
  ): Promise<Record<string, any>> {
    const fields = await this.fieldRepo.findByCollectionId(collectionId, tx);
    const enrichedData = { ...data };

    for (const field of fields) {
      // Apply default if field not provided and default exists
      if (!(field.slug in enrichedData) && field.defaultValue !== null) {
        enrichedData[field.slug] = field.defaultValue;
      }
    }

    return enrichedData;
  }

  /**
   * Create a new record
   */
  async createRecord(
    data: InsertRecord,
    userId?: string,
    tx?: DbTransaction
  ): Promise<CollectionRecord> {
    return this.withTx(data.tenantId, tx, async (scopedTx) => {
      const collection = await this.collectionRepo.findById(data.collectionId, scopedTx);
      if (!collection) {
        throw new Error("Collection not found");
      }
      if (collection.tenantId !== data.tenantId) {
        throw new Error("Access denied - collection belongs to a different tenant");
      }

      // Apply default values
      const recordData = (typeof data.data === 'object' && data.data !== null && !Array.isArray(data.data))
        ? data.data as Record<string, unknown>
        : {};
      const enrichedData = await this.applyDefaults(data.collectionId, recordData, scopedTx);

      // Validate record data
      await this.validateRecordData(data.collectionId, enrichedData, scopedTx);

      return this.recordRepo.create({
        ...data,
        data: enrichedData,
        createdBy: userId,
        updatedBy: userId,
      }, scopedTx);
    });
  }

  /**
   * Get record by ID
   */
  async getRecord(recordId: string, tenantId: string, tx?: DbTransaction): Promise<CollectionRecord> {
    return this.verifyRecordOwnership(recordId, tenantId, undefined, tx);
  }

  /**
   * List records in a collection with pagination
   */
  async listRecords(
    collectionId: string,
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      orderBy?: 'created_at' | 'updated_at';
      order?: 'asc' | 'desc';
    },
    tx?: DbTransaction
  ): Promise<CollectionRecord[]> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      // Verify collection belongs to tenant
      const collection = await this.collectionRepo.findById(collectionId, scopedTx);
      if (!collection || collection.tenantId !== tenantId) {
        // eslint-disable-next-line sonarjs/no-duplicate-string
        throw new Error("Collection not found or access denied");
      }

      return this.recordRepo.findByCollectionId(collectionId, options, scopedTx);
    });
  }

  /**
   * Update record
   */
  async updateRecord(
    recordId: string,
    tenantId: string,
    updates: Partial<Record<string, unknown>>,
    userId?: string,
    tx?: DbTransaction
  ): Promise<CollectionRecord> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const record = await this.verifyRecordOwnership(recordId, tenantId, undefined, scopedTx);

      // Merge with existing data
      const existingData = (typeof record.data === 'object' && record.data !== null && !Array.isArray(record.data))
        ? record.data as Record<string, unknown>
        : {};
      const mergedData = { ...existingData, ...updates };

      // Validate merged data
      await this.validateRecordData(record.collectionId, mergedData, scopedTx);

      return this.recordRepo.update(
        recordId,
        {
          data: mergedData,
          ...(userId && { updatedBy: userId }),
        },
        scopedTx
      );
    });
  }

  /**
   * Delete record
   */
  async deleteRecord(recordId: string, tenantId: string, tx?: DbTransaction): Promise<void> {
    await this.withTx(tenantId, tx, async (scopedTx) => {
      await this.verifyRecordOwnership(recordId, tenantId, undefined, scopedTx);
      await this.recordRepo.delete(recordId, scopedTx);
    });
  }

  /**
   * Count records in collection
   */
  async countRecords(collectionId: string, tenantId: string, tx?: DbTransaction): Promise<number> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const collection = await this.collectionRepo.findById(collectionId, scopedTx);
      if (!collection || collection.tenantId !== tenantId) {
        throw new Error("Collection not found or access denied");
      }

      return this.recordRepo.countByCollectionId(collectionId, scopedTx);
    });
  }

  /**
   * Find records by filters (JSONB query)
   */
  async findRecordsByFilters(
    collectionId: string,
    tenantId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONB filters can contain any valid JSON value
    filters: Record<string, any>,
    tx?: DbTransaction
  ): Promise<CollectionRecord[]> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const collection = await this.collectionRepo.findById(collectionId, scopedTx);
      if (!collection || collection.tenantId !== tenantId) {
        throw new Error("Collection not found or access denied");
      }

      return this.recordRepo.findByFilters(collectionId, filters, scopedTx);
    });
  }

  /**
   * Find records by filters (Array style) with pagination
   * Used by BlockRunner
   */
  async findByFilters(
    tenantId: string,
    collectionId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- filter array can contain various filter structures
    filters: any[],
    options: { page?: number; limit?: number } = {},
    tx?: DbTransaction
  ): Promise<{ records: CollectionRecord[]; total: number }> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const collection = await this.collectionRepo.findById(collectionId, scopedTx);
      if (!collection || collection.tenantId !== tenantId) {
        throw new Error("Collection not found or access denied");
      }

      // Convert array filters to object filters if simple equality
      // OR if repo supports array filters, pass them.
      // Assuming repo supports array queries for now or mapping specific logic.
      // For MVP, handling simple equality from array filters:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- filter object can contain any valid filter value
      const filterObj: Record<string, any> = {};
      if (Array.isArray(filters)) {
        for (const f of filters) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- This legacy service consumes dynamically typed persisted data.
          if (f.operator === 'equals') {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- This legacy service consumes dynamically typed persisted data.
            filterObj[f.field] = f.value;
          }
        }
      }

      const records = await this.recordRepo.findByFilters(collectionId, filterObj, scopedTx);
      // Simulate pagination if repo doesn't support it in findByFilters
      const limit = options.limit ?? 100;
      const page = options.page ?? 1;
      const start = (page - 1) * limit;
      const end = start + limit;

      return {
        records: records.slice(start, end),
        total: records.length
      };
    });
  }

  /**
   * Bulk create records
   */
  async bulkCreateRecords(
    collectionId: string,
    tenantId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSONB record data can contain any valid JSON value
    recordsData: Array<Record<string, any>>,
    userId?: string,
    tx?: DbTransaction
  ): Promise<CollectionRecord[]> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const collection = await this.collectionRepo.findById(collectionId, scopedTx);
      if (!collection || collection.tenantId !== tenantId) {
        throw new Error("Collection not found or access denied");
      }

      const createdRecords: CollectionRecord[] = [];

      for (const data of recordsData) {
        const record = await this.createRecord(
          {
            tenantId,
            collectionId,
            data,
          },
          userId,
          scopedTx
        );
        createdRecords.push(record);
      }

      return createdRecords;
    });
  }
}

// Singleton instance
export const recordService = new RecordService();
