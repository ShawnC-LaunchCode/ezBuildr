import type { CollectionField, InsertCollectionField } from "@shared/schema";

import {
  collectionFieldRepository,
  collectionRepository,
  type DbTransaction,
} from "../repositories";
import { withCurrentTenant } from "../utils/rlsContext";

/**
 * Service layer for collection field business logic
 * Fields define the schema (columns) for collections
 *
 * RLS-2c: `collection_fields` has no `tenant_id` column of its own (scoped via
 * its parent `collections` row, which is RLS-protected) and no method here
 * takes a `tenantId` argument to cross-check — unlike the RLS-2a pilot,
 * there is no second source of truth to guard against a mismatch. `withTx`
 * is therefore the reuse-or-open-ambient half of the pilot's shape only:
 * reuse a caller-supplied `tx`, otherwise open exactly one transaction via
 * the existing `withCurrentTenant` (fails closed with no tenant in context).
 * No second helper — same primitives as CollectionService.withTx.
 */
export class CollectionFieldService {
  private fieldRepo: typeof collectionFieldRepository;
  private collectionRepo: typeof collectionRepository;

  constructor(
    fieldRepo?: typeof collectionFieldRepository,
    collectionRepo?: typeof collectionRepository
  ) {
    this.fieldRepo = fieldRepo ?? collectionFieldRepository;
    this.collectionRepo = collectionRepo ?? collectionRepository;
  }

  private async withTx<T>(
    tx: DbTransaction | undefined,
    fn: (tx: DbTransaction) => Promise<T>
  ): Promise<T> {
    if (tx) {
      return fn(tx);
    }
    return withCurrentTenant(fn);
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
    return this.withTx(tx, async (scopedTx) => {
      const field = await this.fieldRepo.findById(fieldId, scopedTx);

      if (!field) {
        throw new Error("Field not found");
      }

      if (field.collectionId !== collectionId) {
        throw new Error("Access denied - field belongs to different collection");
      }

      return field;
    });
  }

  /**
   * Validate field options based on type
   */
  private validateFieldOptions(type: string, options: unknown): void {
    if ((type === 'select' || type === 'multi_select') && (options === null || options === undefined)) {
      throw new Error(`Field type '${type}' requires options array`);
    }

    if ((type === 'select' || type === 'multi_select') && options !== null && options !== undefined) {
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
  // eslint-disable-next-line complexity -- validation switch covers all field types
  private validateDefaultValue(type: string, defaultValue: unknown): void {
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
    return this.withTx(tx, async (scopedTx) => {
      // Verify collection exists
      await this.verifyCollectionExists(data.collectionId, scopedTx);

      // Generate slug if not provided
      const baseSlug = data.slug || this.generateSlug(data.name);
      const uniqueSlug = await this.ensureUniqueSlug(data.collectionId, baseSlug, undefined, scopedTx);

      // Validate options if field type requires them
      this.validateFieldOptions(data.type, data.options);

      // Validate default value if provided
      if (data.defaultValue !== undefined) {
        this.validateDefaultValue(data.type, data.defaultValue);
      }

      return this.fieldRepo.create({
        ...data,
        slug: uniqueSlug,
      }, scopedTx);
    });
  }

  /**
   * Get field by ID
   */
  async getField(fieldId: string, tx?: DbTransaction): Promise<CollectionField | undefined> {
    return this.withTx(tx, (scopedTx) => this.fieldRepo.findById(fieldId, scopedTx));
  }

  /**
   * List all fields in a collection
   */
  async listFields(collectionId: string, tx?: DbTransaction): Promise<CollectionField[]> {
    return this.withTx(tx, (scopedTx) => this.fieldRepo.findByCollectionId(collectionId, scopedTx));
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
    return this.withTx(tx, async (scopedTx) => {
      await this.verifyFieldOwnership(fieldId, collectionId, scopedTx);

      // If name changed, regenerate slug - DISABLED: Changing name shouldn't change slug automatically
      // if (data.name && !data.slug) {
      //   const baseSlug = this.generateSlug(data.name);
      //   data.slug = await this.ensureUniqueSlug(collectionId, baseSlug, fieldId, scopedTx);
      // }

      // If slug provided, ensure it's unique
      const updateData = { ...data };
      if (updateData.slug) {
        updateData.slug = await this.ensureUniqueSlug(collectionId, updateData.slug, fieldId, scopedTx);
      }

      // Validate options if field type changed or options updated
      if (updateData.type !== undefined || data.options !== undefined) {
        const field = await this.fieldRepo.findById(fieldId, scopedTx);
        const newType = updateData.type ?? field!.type;
        this.validateFieldOptions(newType, data.options);
      }

      // Validate default value if updated
      if (data.defaultValue !== undefined && data.type) {
        this.validateDefaultValue(data.type, data.defaultValue);
      }

      return this.fieldRepo.update(fieldId, updateData, scopedTx);
    });
  }

  /**
   * Delete field
   */
  async deleteField(fieldId: string, collectionId: string, tx?: DbTransaction): Promise<void> {
    await this.withTx(tx, async (scopedTx) => {
      await this.verifyFieldOwnership(fieldId, collectionId, scopedTx);
      await this.fieldRepo.delete(fieldId, scopedTx);
    });
  }

  /**
   * Get field by slug
   */
  async getFieldBySlug(
    collectionId: string,
    slug: string,
    tx?: DbTransaction
  ): Promise<CollectionField | undefined> {
    return this.withTx(tx, (scopedTx) => this.fieldRepo.findByCollectionAndSlug(collectionId, slug, scopedTx));
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
    return this.withTx(tx, async (scopedTx) =>
      !(await this.fieldRepo.slugExists(collectionId, slug, excludeId, scopedTx))
    );
  }

  /**
   * Bulk create fields
   */
  async bulkCreateFields(
    collectionId: string,
    fieldsData: Array<Omit<InsertCollectionField, 'collectionId'>>,
    tx?: DbTransaction
  ): Promise<CollectionField[]> {
    return this.withTx(tx, async (scopedTx) => {
      await this.verifyCollectionExists(collectionId, scopedTx);
      if (fieldsData.length === 0) {return [];}

      // Validate all fields up-front (in memory, no DB calls)
      for (const fieldData of fieldsData) {
        this.validateFieldOptions(fieldData.type, fieldData.options);
        this.validateDefaultValue(fieldData.type, fieldData.defaultValue);
      }

      // Fetch all existing slugs for this collection in one query, then deduplicate in memory
      const existingSlugs = await this.fieldRepo.findSlugsByCollectionId(collectionId, scopedTx);
      const usedSlugs = new Set(existingSlugs);

      const fieldsWithSlugs = fieldsData.map(fieldData => {
        const baseSlug = fieldData.slug ?? this.generateSlug(fieldData.name);
        let slug = baseSlug;
        let counter = 1;
        while (usedSlugs.has(slug)) {
          slug = `${baseSlug}_${counter}`;
          counter++;
        }
        usedSlugs.add(slug);
        return { ...fieldData, collectionId, slug };
      });

      // Single batch insert for all fields
      return this.fieldRepo.createMany(fieldsWithSlugs, scopedTx);
    });
  }
}

// Singleton instance
export const collectionFieldService = new CollectionFieldService();
