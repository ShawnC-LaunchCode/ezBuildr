import type { Collection, CollectionField, InsertCollection } from "@shared/schema";

import {
  collectionRepository,
  collectionFieldRepository,
  recordRepository,
  type DbTransaction,
} from "../repositories";
import { withCurrentTenant, getCurrentTenantId } from "../utils/rlsContext";

/**
 * Service layer for collection-related business logic
 * Collections are tenant-scoped data tables similar to Airtable bases
 *
 * RLS-2a: this is the pilot service for the service-boundary tenant
 * transaction (see docs/architecture/TENANT_ISOLATION_RLS.md). Every public
 * method opens exactly ONE transaction at this boundary via `withTx` and
 * threads it down to every repository call it makes — including calls that
 * span multiple repositories (e.g. `getCollectionWithFields`,
 * `listCollectionsWithStats`) — rather than each repository call getting its
 * own transaction. `withTx` reuses a caller-supplied `tx` instead of opening
 * a nested one, which is what keeps this composable with a future caller
 * that already holds a transaction; today's only caller (the routes) never
 * supplies one, so every request-driven call opens fresh here.
 *
 * TWO SOURCES OF TRUTH, DELIBERATELY, WITH A GUARD (reviewed 2026-08-18):
 *   Every method here also takes an explicit `tenantId` argument, used for
 *   the `eq(tenantId, ...)` predicates (AC3 — those stay; RLS is a backstop,
 *   not a replacement). `withTx` opens the transaction against the AMBIENT
 *   tenant from the async context (`withCurrentTenant`), not the passed
 *   `tenantId`. That is intentional, not an oversight: the whole point of
 *   RLS as a backstop is that it is an INDEPENDENT check. If the transaction
 *   were opened with the same `tenantId` the predicate uses, a bug that
 *   computes the wrong `tenantId` would corrupt both checks identically and
 *   RLS would defend against nothing.
 *   The risk that creates: if the two ever disagree, the predicate scopes to
 *   one tenant and the GUC scopes to another, the intersection is empty, and
 *   the caller sees a silent empty result instead of an error — exactly the
 *   "looks like it's working" failure this phase exists to eliminate.
 *   `withTx` therefore compares them before opening the transaction and
 *   throws if they disagree, rather than silently trusting either one. Today
 *   this can never fire for a request-driven call — RLS-1 sets both the
 *   route's `tenantId` and the async context from the same
 *   `attachUserToRequest`/`cookieStrategy` resolution — but it is a real
 *   guard for a caller that does not go through that path (a future admin
 *   cross-tenant path per `RLS-6`, or a batch job).
 *
 * KNOWN GAP: the guard above only runs on the "we open the transaction"
 *   branch of `withTx`. A caller that supplies its own `tx` skips it
 *   entirely — `withTx` trusts a caller-supplied transaction was opened for
 *   the right tenant and never re-checks the GUC already set on it. Nobody
 *   does that today (every call here comes from the routes with no `tx`),
 *   so this is a documented limitation, not a fixed hole: a future caller
 *   that opens a transaction for tenant A and passes it into a
 *   `CollectionService` call for tenant B gets no warning. RLS-2b services
 *   copying this pattern should know that composability via a passed `tx`
 *   is unguarded by design.
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
   * Run `fn` inside a tenant-scoped transaction opened at this service
   * boundary (RLS-2a). If the caller already handed us a transaction, reuse
   * it — never open a nested one. Otherwise open exactly one via
   * `withCurrentTenant`, which reads the tenant from the request's async
   * context (populated by RLS-1) and sets the transaction-local
   * `app.current_tenant_id` GUC for everything that runs inside `fn`.
   *
   * `expectedTenantId` is whatever this operation's own `tenantId` argument
   * is — the same value the `eq(tenantId, ...)` predicates use. Before
   * opening the transaction we check it against the ambient context and
   * throw on a mismatch instead of silently opening a transaction scoped to
   * the wrong tenant (see the class-level comment above for why this
   * exists). Two fail-closed cases, both by throwing before any query runs:
   *   - no tenant in the async context at all (`withCurrentTenant`'s own
   *     check), and
   *   - a tenant in context that disagrees with `expectedTenantId` (this
   *     method's check).
   */
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
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const collection = await this.collectionRepo.findById(collectionId, scopedTx);

      if (!collection) {
        throw new Error("Collection not found");
      }

      if (collection.tenantId !== tenantId) {
        throw new Error("Access denied - collection belongs to different tenant");
      }

      return collection;
    });
  }

  /**
   * Create a new collection
   */
  async createCollection(data: InsertCollection, tx?: DbTransaction): Promise<Collection> {
    return this.withTx(data.tenantId, tx, async (scopedTx) => {
      // Generate slug if not provided
      const baseSlug = data.slug ?? this.generateSlug(data.name);
      const uniqueSlug = await this.ensureUniqueSlug(data.tenantId, baseSlug, undefined, scopedTx);

      return this.collectionRepo.create({
        ...data,
        slug: uniqueSlug,
      }, scopedTx);
    });
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
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const collection = await this.verifyTenantOwnership(collectionId, tenantId, scopedTx);
      const fields = await this.fieldRepo.findByCollectionId(collectionId, scopedTx);

      return {
        ...collection,
        fields,
      };
    });
  }

  /**
   * List all collections for a tenant
   */
  async listCollections(tenantId: string, tx?: DbTransaction): Promise<Collection[]> {
    return this.withTx(tenantId, tx, (scopedTx) => this.collectionRepo.findByTenantId(tenantId, scopedTx));
  }

  /**
   * List collections with field counts
   */
  async listCollectionsWithStats(tenantId: string, tx?: DbTransaction): Promise<Array<Collection & { fieldCount: number; recordCount: number }>> {
    return this.withTx(tenantId, tx, async (scopedTx) => {
      const collections = await this.collectionRepo.findByTenantId(tenantId, scopedTx);

      if (collections.length === 0) {return [];}
      const collectionIds = collections.map(c => c.id);
      const [fieldCounts, recordCounts] = await Promise.all([
        this.fieldRepo.countByCollectionIds(collectionIds, scopedTx),
        this.recordRepo.countByCollectionIds(collectionIds, scopedTx),
      ]);
      return collections.map(collection => ({
        ...collection,
        fieldCount: fieldCounts.get(collection.id) ?? 0,
        recordCount: recordCounts.get(collection.id) ?? 0,
      }));
    });
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
    return this.withTx(tenantId, tx, async (scopedTx) => {
      await this.verifyTenantOwnership(collectionId, tenantId, scopedTx);

      const updateData = { ...data };

      // If name changed, regenerate slug
      if (updateData.name && !updateData.slug) {
        const baseSlug = this.generateSlug(updateData.name);
        updateData.slug = await this.ensureUniqueSlug(tenantId, baseSlug, collectionId, scopedTx);
      }

      // If slug provided, ensure it's unique
      if (updateData.slug) {
        updateData.slug = await this.ensureUniqueSlug(tenantId, updateData.slug, collectionId, scopedTx);
      }

      return this.collectionRepo.update(collectionId, updateData, scopedTx);
    });
  }

  /**
   * Delete collection (cascades to fields and records)
   */
  async deleteCollection(collectionId: string, tenantId: string, tx?: DbTransaction): Promise<void> {
    await this.withTx(tenantId, tx, async (scopedTx) => {
      await this.verifyTenantOwnership(collectionId, tenantId, scopedTx);
      await this.collectionRepo.delete(collectionId, scopedTx);
    });
  }

  /**
   * Get collection by slug
   */
  async getCollectionBySlug(tenantId: string, slug: string, tx?: DbTransaction): Promise<Collection | undefined> {
    return this.withTx(tenantId, tx, (scopedTx) => this.collectionRepo.findByTenantAndSlug(tenantId, slug, scopedTx));
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
    return this.withTx(tenantId, tx, async (scopedTx) =>
      !(await this.collectionRepo.slugExists(tenantId, slug, excludeId, scopedTx))
    );
  }
}

// Singleton instance
export const collectionService = new CollectionService();
