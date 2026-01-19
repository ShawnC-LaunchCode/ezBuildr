import { randomUUID } from 'crypto';
import * as schema from '@shared/schema';
import { getDb } from '../../server/db';
import type {  } from 'drizzle-orm';
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
export interface TestRun {
  run: typeof schema.runs.$inferSelect;
}
export class TestFactory {
  private db: any;
  /**
   * Create a new TestFactory
   * @param txOrDb - Optional transaction or database instance. If not provided, uses global db.
   *                 Pass a transaction for automatic rollback (recommended).
   */
  constructor(txOrDb?: any) {
    this.db = txOrDb || getDb();
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
    // Create tenant
    const [tenant] = await this.db
      .insert(schema.tenants)
      .values({
        id: generateId(),
        name: 'Test Tenant',
        slug: generateSlug('test-tenant'),
        plan: 'pro',
        ...overrides?.tenant,
      })
      .returning();
    // Create user with admin/owner role for test permissions
    const [user] = await this.db
      .insert(schema.users)
      .values({
        id: generateId(),
        tenantId: tenant.id,
        email: `test-${Date.now()}@example.com`,
        firstName: 'Test',
        lastName: 'User',
        fullName: 'Test User',
        role: 'admin',         // ✅ Admin role for full permissions
        tenantRole: 'owner',   // ✅ Owner for tenant-level access
        authProvider: 'local',
        defaultMode: 'easy',
        ...overrides?.user,
      })
      .returning();
    // Create project with all required ownership fields
    const [project] = await this.db
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
    const [workflow] = await this.db
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
    const [version] = await this.db
      .insert(schema.workflowVersions)
      .values({
        id: generateId(),
        workflowId: workflow.id,
        versionNumber: 1,
        graphJson: {},
        createdBy: userId,
        ...overrides?.version,
      })
      .returning();
    return { workflow, version };
  }
  /**
   * Create a section for a workflow
   */
  async createSection(
    workflowId: string,
    overrides?: Partial<typeof schema.sections.$inferInsert>
  ) {
    const [section] = await this.db
      .insert(schema.sections)
      .values({
        id: generateId(),
        workflowId,
        title: 'Test Section',
        description: 'Test section',
        order: 0,
        ...overrides,
      })
      .returning();
    return section;
  }
  /**
   * Create a step for a section
   */
  async createStep(
    sectionId: string,
    overrides?: Partial<typeof schema.steps.$inferInsert>
  ) {
    const [step] = await this.db
      .insert(schema.steps)
      .values({
        id: generateId(),
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
   * Create a run for a workflow
   */
  async createRun(
    workflowVersionId: string,
    userId: string,
    overrides?: Partial<typeof schema.runs.$inferInsert>
  ): Promise<TestRun> {
    const [run] = await this.db
      .insert(schema.runs)
      .values({
        id: generateId(),
        workflowVersionId,
        createdBy: userId,
        status: 'draft',
        ...overrides,
      })
      .returning();
    return { run };
  }
  /**
   * Create a run output
   */
  async createRunOutput(
    runId: string,
    workflowVersionId: string,
    overrides?: Partial<typeof schema.runOutputs.$inferInsert>
  ) {
    const [output] = await this.db
      .insert(schema.runOutputs)
      .values({
        id: generateId(),
        runId,
        workflowVersionId,
        nodeId: `node-${generateId()}`,
        format: 'docx',
        status: 'pending',
        ...overrides,
      })
      .returning();
    return output;
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
    const [database] = await this.db
      .insert(schema.datavaultDatabases)
      .values({
        id: generateId(),
        projectId,
        tenantId,
        name: 'Test Database',
        slug: `test-db-${generateId()}`,
        description: 'Test database',
        createdBy: userId,
        ...overrides,
      })
      .returning();
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
    const [table] = await this.db
      .insert(schema.datavaultTables)
      .values({
        id: generateId(),
        databaseId,
        name: 'Test Table',
        slug: `test-table-${generateId()}`,
        description: 'Test table',
        ownerUserId: userId,
        columns: [],
        ...overrides,
      })
      .returning();
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
    const [collection] = await this.db
      .insert(schema.collections)
      .values({
        id: generateId(),
        tenantId,
        name: 'Test Collection',
        slug: `test-collection-${generateId()}`,
        description: 'Test collection',
        createdBy: userId,
        ...overrides,
      })
      .returning();
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
    } catch (error) {
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