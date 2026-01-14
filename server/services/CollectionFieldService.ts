import type { CollectionField, InsertCollectionField } from "@shared/schema";

import {
  collectionFieldRepository,
  collectionRepository,
  type DbTransaction,
} from "../repositories";

/**
 * Service layer for collection field business logic
 * Fields define the schema (columns) for collections
 */
export class CollectionFieldService {
  private fieldRepo: typeof collectionFieldRepository;
  private collectionRepo: typeof collectionRepository;

  constructor(
    fieldRepo?: typeof collectionFieldRepository,
    collectionRepo?: typeof collectionRepository
  ) {
    this.fieldRepo = fieldRepo || collectionFieldRepository;
    this.collectionRepo = collectionRepo || collectionRepository;
  }

  /**
   * Generate URL-safe slug from field name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Ensure slug is unique within collection
   */
  private async ensureUniqueSlug(
    collectionId: string,
    baseSlug: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (await this.fieldRepo.slugExists(collectionId, slug, excludeId, tx)) {
      slug = `${baseSlug}_${counter}`;
      counter++;
    }

    return slug;
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
   * Verify field belongs to collection
   */
  async verifyFieldOwnership(fieldId: string, collectionId: string, tx?: DbTransaction): Promise<CollectionField> {
    const field = await this.fieldRepo.findById(fieldId, tx);

    if (!field) {
      throw new Error("Field not found");
    }

    if (field.collectionId !== collectionId) {
      throw new Error("Access denied - field belongs to different collection");
    }

    return field;
  }

  /**
   * Validate field options based on type
   */
  private validateFieldOptions(type: string, options: any): void {
    if ((type === 'select' || type === 'multi_select') && !options) {
      throw new Error(`Field type '${type}' requires options array`);
    }

    if ((type === 'select' || type === 'multi_select') && options) {
      if (!Array.isArray(options)) {
        throw new Error("Options must be an array");
      }
      if (options.length === 0) {
        throw new Error("Options array cannot be empty for select/multi-select fields");
      }
    }
  }

  /**
   * Validate default value based on field type
   */
  private validateDefaultValue(type: string, defaultValue: any): void {
    if (defaultValue === null || defaultValue === undefined) {
      return; // null/undefined is valid for any type
    }

    switch (type) {
      case 'text':
        if (typeof defaultValue !== 'string') {
          throw new Error("Default value for 'text' field must be a string");
        }
        break;
      case 'number':
        if (typeof defaultValue !== 'number') {
          throw new Error("Default value for 'number' field must be a number");
        }
        break;
      case 'boolean':
        if (typeof defaultValue !== 'boolean') {
          throw new Error("Default value for 'boolean' field must be a boolean");
        }
        break;
      case 'date':
      case 'datetime':
        // Accept ISO string or Date object
        if (typeof defaultValue !== 'string' && !(defaultValue instanceof Date)) {
          throw new Error(`Default value for '${type}' field must be an ISO date string`);
        }
        // Validate that string can be parsed as a valid date
        if (typeof defaultValue === 'string') {
          const parsed = new Date(defaultValue);
          if (isNaN(parsed.getTime())) {
            throw new Error(`Default value for '${type}' field must be a valid date string`);
          }
        }
        break;
      case 'select':
        if (typeof defaultValue !== 'string') {
          throw new Error("Default value for 'select' field must be a string");
        }
        break;
      case 'multi_select':
        if (!Array.isArray(defaultValue)) {
          throw new Error("Default value for 'multi_select' field must be an array");
        }
        break;
      case 'json':
        // JSON can be any valid JSON value
        break;
      case 'file':
        // File fields typically don't have default values
        break;
    }
  }

  /**
   * Create a new field
   */
  async createField(data: InsertCollectionField, tx?: DbTransaction): Promise<CollectionField> {
    // Verify collection exists
    await this.verifyCollectionExists(data.collectionId, tx);

    // Generate slug if not provided
    const baseSlug = data.slug || this.generateSlug(data.name);
    const uniqueSlug = await this.ensureUniqueSlug(data.collectionId, baseSlug, undefined, tx);

    // Validate options if field type requires them
    this.validateFieldOptions(data.type, data.options);

    // Validate default value if provided
    if (data.defaultValue !== undefined) {
      this.validateDefaultValue(data.type, data.defaultValue);
    }

    return this.fieldRepo.create({
      ...data,
      slug: uniqueSlug,
    }, tx);
  }

  /**
   * Get field by ID
   */
  async getField(fieldId: string, tx?: DbTransaction): Promise<CollectionField | undefined> {
    return this.fieldRepo.findById(fieldId, tx);
  }

  /**
   * List all fields in a collection
   */
  async listFields(collectionId: string, tx?: DbTransaction): Promise<CollectionField[]> {
    return this.fieldRepo.findByCollectionId(collectionId, tx);
  }

  /**
   * Update field
   */
  async updateField(
    fieldId: string,
    collectionId: string,
    data: Partial<InsertCollectionField>,
    tx?: DbTransaction
  ): Promise<CollectionField> {
    await this.verifyFieldOwnership(fieldId, collectionId, tx);

    // If name changed, regenerate slug - DISABLED: Changing name shouldn't change slug automatically
    // if (data.name && !data.slug) {
    //   const baseSlug = this.generateSlug(data.name);
    //   data.slug = await this.ensureUniqueSlug(collectionId, baseSlug, fieldId, tx);
    // }

    // If slug provided, ensure it's unique
    if (data.slug) {
      data.slug = await this.ensureUniqueSlug(collectionId, data.slug, fieldId, tx);
    }

    // Validate options if field type changed or options updated
    if (data.type || data.options !== undefined) {
      const field = await this.fieldRepo.findById(fieldId, tx);
      const newType = data.type || field!.type;
      this.validateFieldOptions(newType, data.options);
    }

    // Validate default value if updated
    if (data.defaultValue !== undefined && data.type) {
      this.validateDefaultValue(data.type, data.defaultValue);
    }

    return this.fieldRepo.update(fieldId, data, tx);
  }

  /**
   * Delete field
   */
  async deleteField(fieldId: string, collectionId: string, tx?: DbTransaction): Promise<void> {
    await this.verifyFieldOwnership(fieldId, collectionId, tx);
    await this.fieldRepo.delete(fieldId, tx);
  }

  /**
   * Get field by slug
   */
  async getFieldBySlug(
    collectionId: string,
    slug: string,
    tx?: DbTransaction
  ): Promise<CollectionField | undefined> {
    return this.fieldRepo.findByCollectionAndSlug(collectionId, slug, tx);
  }

  /**
   * Check if field slug is available in collection
   */
  async isSlugAvailable(
    collectionId: string,
    slug: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    return !(await this.fieldRepo.slugExists(collectionId, slug, excludeId, tx));
  }

  /**
   * Bulk create fields
   */
  async bulkCreateFields(
    collectionId: string,
    fieldsData: InsertCollectionField[],
    tx?: DbTransaction
  ): Promise<CollectionField[]> {
    await this.verifyCollectionExists(collectionId, tx);

    const createdFields: CollectionField[] = [];

    for (const fieldData of fieldsData) {
      const field = await this.createField(
        { ...fieldData, collectionId },
        tx
      );
      createdFields.push(field);
    }

    return createdFields;
  }
}

// Singleton instance
export const collectionFieldService = new CollectionFieldService();
