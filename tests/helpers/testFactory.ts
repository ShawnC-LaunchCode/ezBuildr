
import { randomUUID } from 'crypto';

import { eq, sql } from 'drizzle-orm';

import * as schema from '@shared/schema';

import { getDb } from '../../server/db';
import { getOwnerDb } from './ownerDb';
import type { DbTransaction } from '../../server/repositories/BaseRepository';
import { applyTenantToTransaction } from '../../server/utils/rlsContext';

type DBInstance = NonNullable<ReturnType<typeof getDb>>;
// Generate a unique ID suitable for the database
// For UUID columns, use crypto.randomUUID()
// For string IDs, use a shorter format
function generateId(): string {
  return randomUUID();
}
function generateSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
/**
 * Test Data Factory
 *
 * Provides helper functions to create test entities with proper foreign key relationships.
 * All IDs are generated using generateId() to avoid collisions between tests.
 *
 * RECOMMENDED USAGE (with transaction):
 * ```typescript
 * import { runInTransaction } from './testTransaction';
 * import { TestFactory } from './testFactory';
 *
 * it('should do something', async () => {
 *   await runInTransaction(async (tx) => {
 *     const factory = new TestFactory(tx);
 *     const { tenant, user, project } = await factory.createTenant();
 *     const workflow = await factory.createWorkflow(project.id, user.id);
 *     // Test logic here
 *     // Automatic rollback!
 *   });
 * });
 * ```
 *
 * ALTERNATIVE USAGE (without transaction):
 * ```typescript
 * const factory = new TestFactory();
 * const { tenant, user, project } = await factory.createTenant();
 * // Remember to cleanup!
 * await factory.cleanup({ tenantIds: [tenant.id] });
 * ```
 */
export interface TestTenant {
  tenant: typeof schema.tenants.$inferSelect;
  user: typeof schema.users.$inferSelect;
  project: typeof schema.projects.$inferSelect;
}
export interface TestWorkflow {
  workflow: typeof schema.workflows.$inferSelect;
  version: typeof schema.workflowVersions.$inferSelect;
}
export interface TestTemplate {
  template: typeof schema.templates.$inferSelect;
}
export class TestFactory {
  private db: DBInstance | DbTransaction;
  // RLS-5: the tenant most recently established by createTenant()/
  // createWorkflow() on this instance, remembered so later calls that don't
  // otherwise know a tenant (createSection, createStep, ...) can still pin
  // it. Opportunistic, not required — see withKnownTenant.
  private lastTenantId?: string;
  /**
   * Create a new TestFactory
   * @param txOrDb - Optional transaction or database instance. If not provided, uses global db.
   *                 Pass a transaction for automatic rollback (recommended).
   */
  constructor(txOrDb?: DBInstance | DbTransaction) {
    // RLS-5: defaults to the OBSERVER, not the application pool.
    //
    // This class exists to build the world a test is exercised in — it is the
    // fixture layer, never the code under test. Under RLS_RESTRICTED the app's
    // pool is a genuine non-owner, so a default of `getDb()` had `users`,
    // `workflows`, `sections` and the DataVault tables reject fixture rows,
    // and 22 suites failed for harness reasons that read exactly like
    // application defects.
    //
    // A caller passing an explicit handle still wins — in particular
    // `runInTransaction`'s `tx`, which is how a suite gets automatic rollback.
    // See tests/helpers/ownerDb.ts for why the observer/app split exists.
    this.db = txOrDb ?? getOwnerDb();
  }
  /**
   * Run `fn` inside a transaction pinned to `lastTenantId` if this instance
   * has one (set by a prior createTenant()/createWorkflow() call), otherwise
   * run it exactly as before — unscoped, against `this.db` directly. Not
   * required for these helpers to work when RLS is unenforced, but needed
   * once it is: `sections`/`steps`/`datavault_*`/`collections` are all
   * RLS-covered and reject an unscoped write the same way `workflows` did
   * (RLS-5 finding). Backward compatible by construction — a caller that
   * never established a tenant on this instance sees no behaviour change.
   */
  private async withKnownTenant<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
    if (!this.lastTenantId) {
      return fn(this.db as DbTransaction);
    }
    const tenantId = this.lastTenantId;
    return this.db.transaction(async (tx: DbTransaction) => {
      await applyTenantToTransaction(tx, tenantId);
      return fn(tx);
    });
  }
  /**
   * Create a complete tenant hierarchy (tenant -> user -> project)
   * This is the foundation for most test scenarios
   */
  async createTenant(overrides?: {
    tenant?: Partial<typeof schema.tenants.$inferInsert>;
    user?: Partial<typeof schema.users.$inferInsert>;
    project?: Partial<typeof schema.projects.$inferInsert>;
  }): Promise<TestTenant> {
    // Wrap all inserts in a transaction to guarantee Neon read-after-write consistency.
    // Without a transaction, Neon may route consecutive queries to different backends,
    // causing FK violations when child rows reference just-inserted parent rows.
    return this.db.transaction(async (tx: DbTransaction) => {
      // Create tenant
      const [tenant] = await tx
        .insert(schema.tenants)
        .values({
          id: generateId(),
          name: 'Test Tenant',
          // @ts-expect-error - TODO: fix type
          slug: generateSlug('test-tenant'),
          plan: 'pro',
          ...overrides?.tenant,
        })
        .returning();
      // RLS-5 finding (same shape as tests/helpers/integrationTestHelper.ts):
      // users/projects below write a real (non-null) tenantId with no
      // ambient GUC pinned — under a genuine non-owner role this fails RLS's
      // WITH CHECK. Pin it now that the tenant this transaction is building
      // is known; safe as a plain `applyTenantToTransaction` (not
      // `withTenantAsUser`) because these are fresh INSERTs, not an UPDATE
      // moving an existing row between tenants — INSERT has no pre-existing
      // row for RLS's USING clause to hide.
      await applyTenantToTransaction(tx, tenant.id);
      this.lastTenantId = tenant.id;
      // Create user with admin/owner role for test permissions
      const [user] = await tx
        .insert(schema.users)
        .values({
          id: generateId(),
          tenantId: tenant.id,
          email: `test-${Date.now()}@example.com`,
          firstName: 'Test',
          lastName: 'User',
          fullName: 'Test User',
          role: 'admin',         // Admin role for full permissions
          tenantRole: 'owner',   // Owner for tenant-level access
          authProvider: 'local',
          defaultMode: 'easy',
          ...overrides?.user,
        })
        .returning();
      // Create project with all required ownership fields
      const [project] = await tx
        .insert(schema.projects)
        .values({
          id: generateId(),
          tenantId: tenant.id,
          name: 'Test Project',
          title: 'Test Project', // Required field
          description: 'Test project for integration tests',
          createdBy: user.id,
          creatorId: user.id,  // Backward compatibility
          ownerId: user.id,    // Owner for access control
          ...overrides?.project,
        })
        .returning();
      return { tenant, user, project };
    });
  }
  /**
   * Create a workflow with version
   */
  async createWorkflow(
    projectId: string,
    userId: string,
    overrides?: {
      workflow?: Partial<typeof schema.workflows.$inferInsert>;
      version?: Partial<typeof schema.workflowVersions.$inferInsert>;
    }
  ): Promise<TestWorkflow> {
    // Transaction ensures Neon routes workflow + version inserts to same backend
    return this.db.transaction(async (tx: DbTransaction) => {
      // RLS-5 finding: `workflows` is ownership-derived (no tenant_id
      // column) — its policy resolves the tenant via `app_owner_tenant()`,
      // which itself reads `users`/`projects` under RLS as the SAME calling
      // role. With no GUC pinned, that internal read (and the WITH CHECK on
      // this insert) both fail. Unlike createTenant(), this method isn't
      // given a tenantId directly, so discover it via the self-identification
      // clause (migration 0028) on the already-known userId, then pin it —
      // the same bootstrap shape `withTenantAsUser` exists for, just needing
      // the lookup step first since only userId is in hand here.
      await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
      const [actingUser] = await tx
        .select({ tenantId: schema.users.tenantId })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      if (actingUser?.tenantId) {
        await applyTenantToTransaction(tx, actingUser.tenantId);
        this.lastTenantId = actingUser.tenantId;
      }
      const [workflow] = await tx
        .insert(schema.workflows)
        .values({
          id: generateId(),
          projectId,
          title: 'Test Workflow',
          description: 'Test workflow',
          status: 'draft',
          creatorId: userId,
          ownerId: userId, // Required field
          publicLink: `test-workflow-${generateId()}`,
          ...overrides?.workflow,
        })
        .returning();
      const [version] = await tx
        .insert(schema.workflowVersions)
        .values({
          id: generateId(),
          workflowId: workflow.id,
          versionNumber: 1,
          // RVP-2: a run pinned to this version now has its navigation and
          // completion validated against this graph (via
          // RunDefinitionProvider), not just the live tables. `{}` used to be
          // a harmless placeholder because nothing ever parsed it; now it
          // fails VersionRuntimeSchema (missing `title`/`sections`) for any
          // test that points currentVersionId/pinnedVersionId at this
          // version. Default to a schema-valid empty graph; tests that need
          // specific pinned content still override via `overrides.version`.
          graphJson: { title: workflow.title, sections: [] },
          createdBy: userId,
          ...overrides?.version,
        })
        .returning();
      return { workflow, version };
    });
  }
  /**
   * Create a section for a workflow
   */
  async createSection(
    workflowId: string,
    overrides?: Partial<typeof schema.sections.$inferInsert>
  ) {
    const [section] = await this.withKnownTenant((tx) => tx
      .insert(schema.sections)
      .values({
        id: generateId(),
        workflowId,
        title: 'Test Section',
        description: 'Test section',
        order: 0,
        ...overrides,
      })
      .returning());
    return section;
  }
  /**
   * Create a step for a section
   */
  async createStep(
    sectionId: string,
    overrides?: Partial<typeof schema.steps.$inferInsert>
  ) {
    return this.withKnownTenant(async (tx) => {
      const workflowId = overrides?.workflowId ?? (
        await tx
          .select({ workflowId: schema.sections.workflowId })
          .from(schema.sections)
          .where(eq(schema.sections.id, sectionId))
          .limit(1)
      )[0]?.workflowId;

      if (!workflowId) {
        throw new Error(`Cannot create test step for unknown section ${sectionId}`);
      }

      const [step] = await tx
        .insert(schema.steps)
        .values({
          id: generateId(),
          workflowId,
          sectionId,
          type: 'short_text',
          title: 'Test Step',
          description: 'Test step',
          required: false,
          order: 0,
          ...overrides,
        })
        .returning();
      return step;
    });
  }
  /**
   * Create a template
   */
  async createTemplate(
    projectId: string,
    userId: string,
    overrides?: Partial<typeof schema.templates.$inferInsert>
  ): Promise<TestTemplate> {
    const [template] = await this.db
      .insert(schema.templates)
      .values({
        id: generateId(),
        projectId,
        name: 'Test Template',
        description: 'Test template',
        type: 'docx',
        fileRef: '/test/template.docx',
        lastModifiedBy: userId,
        ...overrides,
      })
      .returning();
    return { template };
  }
  /**
   * Create a workflow template mapping
   */
  async createWorkflowTemplate(
    workflowVersionId: string,
    templateId: string,
    overrides?: Partial<typeof schema.workflowTemplates.$inferInsert>
  ) {
    const [workflowTemplate] = await this.db
      .insert(schema.workflowTemplates)
      .values({
        id: generateId(),
        workflowVersionId,
        templateId,
        key: `template-${generateId()}`,
        isPrimary: true,
        ...overrides,
      })
      .returning();
    return workflowTemplate;
  }
  /**
   * Create a database (DataVault)
   */
  async createDatabase(
    projectId: string,
    tenantId: string,
    userId: string,
    overrides?: Partial<typeof schema.datavaultDatabases.$inferInsert>
  ) {
    // tenantId is given directly here, unlike createSection/createStep — use
    // it rather than lastTenantId, which may not have been set (or may be
    // stale) if the caller didn't build this database's hierarchy through
    // createTenant() first.
    this.lastTenantId = tenantId;
    const [database] = await this.withKnownTenant((tx) => tx
      .insert(schema.datavaultDatabases)
      .values({
        id: generateId(),
        // @ts-expect-error - TODO: fix type
        projectId,
        tenantId,
        name: 'Test Database',
        slug: `test-db-${generateId()}`,
        description: 'Test database',
        createdBy: userId,
        ...overrides,
      })
      .returning());
    return database;
  }
  /**
   * Create a table (DataVault)
   */
  async createTable(
    databaseId: string,
    userId: string,
    overrides?: Partial<typeof schema.datavaultTables.$inferInsert>
  ) {
    // No tenantId parameter here — relies on lastTenantId, set by a prior
    // createDatabase() call on this same instance.
    const [table] = await this.withKnownTenant((tx) => tx
      .insert(schema.datavaultTables)
      .values({
        id: generateId(),
        databaseId,
        name: 'Test Table',
        slug: `test-table-${generateId()}`,
        description: 'Test table',
        ownerUserId: userId,
        // @ts-expect-error - TODO: fix type
        columns: [],
        ...overrides,
      })
      .returning());
    return table;
  }
  /**
   * Create a collection
   */
  async createCollection(
    tenantId: string,
    userId: string,
    overrides?: Partial<typeof schema.collections.$inferInsert>
  ) {
    this.lastTenantId = tenantId;
    const [collection] = await this.withKnownTenant((tx) => tx
      .insert(schema.collections)
      .values({
        id: generateId(),
        tenantId,
        name: 'Test Collection',
        slug: `test-collection-${generateId()}`,
        description: 'Test collection',
        // @ts-expect-error - TODO: fix type
        createdBy: userId,
        ...overrides,
      })
      .returning());
    return collection;
  }
  /**
   * Clean up test data (deletes in correct order to respect foreign keys)
   * Pass the root entity IDs to delete
   *
   * Note: Most tables have ON DELETE CASCADE set up, so deleting the tenant
   * will cascade delete most child records. However, some tables may not have
   * proper CASCADE set up, so we delete in the correct order.
   */
  async cleanup(options: {
    tenantIds?: string[];
    projectIds?: string[];
    workflowIds?: string[];
    userIds?: string[];
  }) {
    const {  inArray } = await import('drizzle-orm');
    // For tenant cleanup, we need to be careful about foreign keys
    // The safest approach is to delete tenants which should CASCADE to everything
    // However, if there are foreign key issues, we can add explicit deletes here
    try {
      if (options.workflowIds?.length) {
        // Workflow children are cascade deleted
        await this.db
          .delete(schema.workflows)
          .where(inArray(schema.workflows.id, options.workflowIds));
      }
      if (options.projectIds?.length) {
        // Project children are cascade deleted
        await this.db
          .delete(schema.projects)
          .where(inArray(schema.projects.id, options.projectIds));
      }
      if (options.userIds?.length) {
        // User children are cascade deleted
        await this.db
          .delete(schema.users)
          .where(inArray(schema.users.id, options.userIds));
      }
      if (options.tenantIds?.length) {
        // Tenant children should be cascade deleted
        // But first, let's explicitly delete projects to trigger their cascades
        await this.db
          .delete(schema.projects)
          .where(inArray(schema.projects.tenantId, options.tenantIds));
        // Now delete tenants (will cascade delete users and other tenant-scoped data)
        await this.db
          .delete(schema.tenants)
          .where(inArray(schema.tenants.id, options.tenantIds));
      }
    } catch (error: unknown) {
      // Log cleanup errors but don't fail the test
      console.warn('Cleanup warning:', error);
    }
  }
}
/**
 * Create a test factory instance
 */
export function createTestFactory(): TestFactory {
  return new TestFactory();
}
