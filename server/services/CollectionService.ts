import type { Collection, CollectionField, InsertCollection } from "@shared/schema";

import {
  collectionRepository,
  collectionFieldRepository,
  recordRepository,
  type DbTransaction,
} from "../repositories";

/**
 * Service layer for collection-related business logic
 * Collections are tenant-scoped data tables similar to Airtable bases
 */
export class CollectionService {
  private collectionRepo: typeof collectionRepository;
  private fieldRepo: typeof collectionFieldRepository;
  private recordRepo: typeof recordRepository;

  constructor(
    collectionRepo?: typeof collectionRepository,
    fieldRepo?: typeof collectionFieldRepository,
    recordRepo?: typeof recordRepository
  ) {
    this.collectionRepo = collectionRepo ?? collectionRepository;
    this.fieldRepo = fieldRepo ?? collectionFieldRepository;
    this.recordRepo = recordRepo ?? recordRepository;
  }

  /**
   * Generate URL-safe slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Ensure slug is unique for the tenant
   */
  private async ensureUniqueSlug(
    tenantId: string,
    baseSlug: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<string> {
    let slug = baseSlug;
    let counter = 1;

    while (await this.collectionRepo.slugExists(tenantId, slug, excludeId, tx)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Verify collection belongs to tenant
   */
  async verifyTenantOwnership(collectionId: string, tenantId: string, tx?: DbTransaction): Promise<Collection> {
    const collection = await this.collectionRepo.findById(collectionId, tx);

    if (!collection) {
      throw new Error("Collection not found");
    }

    if (collection.tenantId !== tenantId) {
      throw new Error("Access denied - collection belongs to different tenant");
    }

    return collection;
  }

  /**
   * Create a new collection
   */
  async createCollection(data: InsertCollection, tx?: DbTransaction): Promise<Collection> {
    // Generate slug if not provided
    const baseSlug = data.slug ?? this.generateSlug(data.name);
    const uniqueSlug = await this.ensureUniqueSlug(data.tenantId, baseSlug, undefined, tx);

    return this.collectionRepo.create({
      ...data,
      slug: uniqueSlug,
    }, tx);
  }

  /**
   * Get collection by ID with tenant verification
   */
  async getCollection(collectionId: string, tenantId: string, tx?: DbTransaction): Promise<Collection> {
    return this.verifyTenantOwnership(collectionId, tenantId, tx);
  }

  /**
   * Get collection with fields
   */
  async getCollectionWithFields(collectionId: string, tenantId: string, tx?: DbTransaction): Promise<Collection & { fields: CollectionField[] }> {
    const collection = await this.verifyTenantOwnership(collectionId, tenantId, tx);
    const fields = await this.fieldRepo.findByCollectionId(collectionId, tx);

    return {
      ...collection,
      fields,
    };
  }

  /**
   * List all collections for a tenant
   */
  async listCollections(tenantId: string, tx?: DbTransaction): Promise<Collection[]> {
    return this.collectionRepo.findByTenantId(tenantId, tx);
  }

  /**
   * List collections with field counts
   */
  async listCollectionsWithStats(tenantId: string, tx?: DbTransaction): Promise<Array<Collection & { fieldCount: number; recordCount: number }>> {
    const collections = await this.collectionRepo.findByTenantId(tenantId, tx);

    if (collections.length === 0) return [];
    const collectionIds = collections.map(c => c.id);
    const [fieldCounts, recordCounts] = await Promise.all([
      this.fieldRepo.countByCollectionIds(collectionIds, tx),
      this.recordRepo.countByCollectionIds(collectionIds, tx),
    ]);
    return collections.map(collection => ({
      ...collection,
      fieldCount: fieldCounts.get(collection.id) ?? 0,
      recordCount: recordCounts.get(collection.id) ?? 0,
    }));
  }

  /**
   * Update collection
   */
  async updateCollection(
    collectionId: string,
    tenantId: string,
    data: Partial<InsertCollection>,
    tx?: DbTransaction
  ): Promise<Collection> {
    await this.verifyTenantOwnership(collectionId, tenantId, tx);

    const updateData = { ...data };

    // If name changed, regenerate slug
    if (updateData.name && !updateData.slug) {
      const baseSlug = this.generateSlug(updateData.name);
      updateData.slug = await this.ensureUniqueSlug(tenantId, baseSlug, collectionId, tx);
    }

    // If slug provided, ensure it's unique
    if (updateData.slug) {
      updateData.slug = await this.ensureUniqueSlug(tenantId, updateData.slug, collectionId, tx);
    }

    return this.collectionRepo.update(collectionId, updateData, tx);
  }

  /**
   * Delete collection (cascades to fields and records)
   */
  async deleteCollection(collectionId: string, tenantId: string, tx?: DbTransaction): Promise<void> {
    await this.verifyTenantOwnership(collectionId, tenantId, tx);
    await this.collectionRepo.delete(collectionId, tx);
  }

  /**
   * Get collection by slug
   */
  async getCollectionBySlug(tenantId: string, slug: string, tx?: DbTransaction): Promise<Collection | undefined> {
    return this.collectionRepo.findByTenantAndSlug(tenantId, slug, tx);
  }

  /**
   * Check if collection name/slug is available
   */
  async isSlugAvailable(
    tenantId: string,
    slug: string,
    excludeId?: string,
    tx?: DbTransaction
  ): Promise<boolean> {
    return !(await this.collectionRepo.slugExists(tenantId, slug, excludeId, tx));
  }
}

// Singleton instance
export const collectionService = new CollectionService();
