import type { CollectionRecord, InsertRecord, CollectionField } from "@shared/schema";

import {
  recordRepository,
  collectionRepository,
  collectionFieldRepository,
  type DbTransaction,
} from "../repositories";

/**
 * Service layer for record business logic
 * Records are rows in collections with validated JSONB data
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
    this.recordRepo = recordRepo || recordRepository;
    this.collectionRepo = collectionRepo || collectionRepository;
    this.fieldRepo = fieldRepo || collectionFieldRepository;
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
    const record = await this.recordRepo.findById(recordId, tx);

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
  }

  /**
   * Validate record data against collection fields
   */
  private async validateRecordData(
    collectionId: string,
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
        throw new Error(`Unknown field type '${field.type}'`);
    }
  }

  /**
   * Apply default values to record data
   */
  private async applyDefaults(
    collectionId: string,
    data: Record<string, any>,
    tx?: DbTransaction
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
    await this.verifyCollectionExists(data.collectionId, tx);

    // Apply default values
    const recordData = (typeof data.data === 'object' && data.data !== null && !Array.isArray(data.data))
      ? data.data as Record<string, any>
      : {};
    const enrichedData = await this.applyDefaults(data.collectionId, recordData, tx);

    // Validate record data
    await this.validateRecordData(data.collectionId, enrichedData, tx);

    return this.recordRepo.create({
      ...data,
      data: enrichedData,
      createdBy: userId,
      updatedBy: userId,
    }, tx);
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
    // Verify collection belongs to tenant
    const collection = await this.collectionRepo.findById(collectionId, tx);
    if (!collection || collection.tenantId !== tenantId) {
      throw new Error("Collection not found or access denied");
    }

    return this.recordRepo.findByCollectionId(collectionId, options, tx);
  }

  /**
   * Update record
   */
  async updateRecord(
    recordId: string,
    tenantId: string,
    updates: Partial<Record<string, any>>,
    userId?: string,
    tx?: DbTransaction
  ): Promise<CollectionRecord> {
    const record = await this.verifyRecordOwnership(recordId, tenantId, undefined, tx);

    // Merge with existing data
    const existingData = (typeof record.data === 'object' && record.data !== null && !Array.isArray(record.data))
      ? record.data as Record<string, any>
      : {};
    const mergedData = { ...existingData, ...updates };

    // Validate merged data
    await this.validateRecordData(record.collectionId, mergedData, tx);

    return this.recordRepo.update(
      recordId,
      {
        data: mergedData,
        ...(userId && { updatedBy: userId }),
      },
      tx
    );
  }

  /**
   * Delete record
   */
  async deleteRecord(recordId: string, tenantId: string, tx?: DbTransaction): Promise<void> {
    await this.verifyRecordOwnership(recordId, tenantId, undefined, tx);
    await this.recordRepo.delete(recordId, tx);
  }

  /**
   * Count records in collection
   */
  async countRecords(collectionId: string, tenantId: string, tx?: DbTransaction): Promise<number> {
    const collection = await this.collectionRepo.findById(collectionId, tx);
    if (!collection || collection.tenantId !== tenantId) {
      throw new Error("Collection not found or access denied");
    }

    return this.recordRepo.countByCollectionId(collectionId, tx);
  }

  /**
   * Find records by filters (JSONB query)
   */
  async findRecordsByFilters(
    collectionId: string,
    tenantId: string,
    filters: Record<string, any>,
    tx?: DbTransaction
  ): Promise<CollectionRecord[]> {
    const collection = await this.collectionRepo.findById(collectionId, tx);
    if (!collection || collection.tenantId !== tenantId) {
      throw new Error("Collection not found or access denied");
    }

    return this.recordRepo.findByFilters(collectionId, filters, tx);
  }

  /**
   * Find records by filters (Array style) with pagination
   * Used by BlockRunner
   */
  async findByFilters(
    tenantId: string,
    collectionId: string,
    filters: any[],
    options: { page?: number; limit?: number } = {},
    tx?: DbTransaction
  ): Promise<{ records: CollectionRecord[]; total: number }> {
    const collection = await this.collectionRepo.findById(collectionId, tx);
    if (!collection || collection.tenantId !== tenantId) {
      throw new Error("Collection not found or access denied");
    }

    // Convert array filters to object filters if simple equality
    // OR if repo supports array filters, pass them.
    // Assuming repo supports array queries for now or mapping specific logic.
    // For MVP, handling simple equality from array filters:
    const filterObj: Record<string, any> = {};
    if (Array.isArray(filters)) {
      for (const f of filters) {
        if (f.operator === 'equals') {
          filterObj[f.field] = f.value;
        }
      }
    }

    const records = await this.recordRepo.findByFilters(collectionId, filterObj, tx);
    // Simulate pagination if repo doesn't support it in findByFilters
    const limit = options.limit || 100;
    const page = options.page || 1;
    const start = (page - 1) * limit;
    const end = start + limit;

    return {
      records: records.slice(start, end),
      total: records.length
    };
  }

  /**
   * Bulk create records
   */
  async bulkCreateRecords(
    collectionId: string,
    tenantId: string,
    recordsData: Array<Record<string, any>>,
    userId?: string,
    tx?: DbTransaction
  ): Promise<CollectionRecord[]> {
    const collection = await this.collectionRepo.findById(collectionId, tx);
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
        tx
      );
      createdRecords.push(record);
    }

    return createdRecords;
  }
}

// Singleton instance
export const recordService = new RecordService();
