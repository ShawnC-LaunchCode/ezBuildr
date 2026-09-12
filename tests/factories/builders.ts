/**
 * Test Data Builders
 *
 * Provides builder pattern classes for constructing complex test objects
 * with fluent interfaces. Builders are useful when you need to create
 * interconnected objects (workflows with pages and steps) or when
 * you need to build up test data incrementally.
 *
 * Usage:
 * ```ts
 * const workflow = await new WorkflowBuilder()
 *   .withTitle('My Workflow')
 *   .addPage('Contact Info', (page) => {
 *     page
 *       .addStep('text', { alias: 'name', title: 'Name' })
 *       .addStep('email', { alias: 'email', title: 'Email' });
 *   })
 *   .addPage('Details', (page) => {
 *     page.addStep('text', { alias: 'description' });
 *   })
 *   .build(db);
 * ```
 */
import * as schema from '@shared/schema';

import { db } from '../../server/db';

import { createTestWorkflow, createTestPage, // Added back
  createTestStep, createTestProject, createTestTenant, createTestOrganization, createTestUser } from './index';
type Database = typeof db;
// ===================================================================
// Page Builder
// ===================================================================
/**
 * Builder for creating a page with multiple steps
 */
export class PageBuilder {
  private pageData: ReturnType<typeof createTestPage>;
  private steps: Array<ReturnType<typeof createTestStep>> = [];
  constructor(title: string, order: number = 0) {
    this.pageData = createTestPage({ title, order });
  }
  /**
   * Override page properties
   */
  with(overrides: Record<string, unknown>): this {
    Object.assign(this.pageData, overrides);
    return this;
  }
  /**
   * Add a step to this page
   * @param type Step type (e.g., 'text', 'email', 'phone')
   * @param overrides Additional step properties
   */
  addStep(type: ReturnType<typeof createTestStep>["type"], overrides?: Record<string, unknown>): this {
    const step = createTestStep({
      type,
      order: this.steps.length,
      ...overrides,
    });
    this.steps.push(step);
    return this;
  }
  /**
   * Add multiple steps at once
   */
  addSteps(steps: Array<{ type: ReturnType<typeof createTestStep>["type"]; overrides?: Record<string, unknown> }>): this {
    for (const step of steps) {
      this.addStep(step.type, step.overrides);
    }
    return this;
  }
  /**
   * Internal: Build page and steps into database
   */
  async build(db: Database, workflowId: string): Promise<{ page: Record<string, unknown>; steps: Record<string, unknown>[] }> {
    // Insert page
    const [page] = await db
      .insert(schema.pages)
      .values({ ...this.pageData, workflowId })
      .returning();
    // Insert all steps
    const insertedSteps = [];
    for (const stepData of this.steps) {
      const [step] = await db
        .insert(schema.steps)
        .values({ ...stepData, workflowId, pageId: page.id })
        .returning();
      insertedSteps.push(step);
    }
    return { page, steps: insertedSteps };
  }
  /**
   * Get data without inserting to database
   */
  getData() {
    return {
      page: this.pageData,
      steps: this.steps,
    };
  }
}
// ===================================================================
// Workflow Builder
// ===================================================================
/**
 * Builder for creating a complete workflow with pages and steps
 */
export class WorkflowBuilder {
  private workflowData: ReturnType<typeof createTestWorkflow>;
  private pages: PageBuilder[] = [];
  private projectId?: string;
  constructor(title?: string) {
    this.workflowData = createTestWorkflow(title ? { title } : undefined);
  }
  /**
   * Set the workflow title
   */
  withTitle(title: string): this {
    this.workflowData.title = title;
    return this;
  }
  /**
   * Set the workflow description
   */
  withDescription(description: string): this {
    this.workflowData.description = description;
    return this;
  }
  /**
   * Set workflow status (draft, active, archived)
   */
  withStatus(status: 'draft' | 'active' | 'archived'): this {
    this.workflowData.status = status;
    return this;
  }
  /**
   * Make workflow public
   */
  makePublic(slug?: string): this {
    this.workflowData.isPublic = true;
    this.workflowData.requireLogin = false;
    if (slug) {
      this.workflowData.slug = slug;
    }
    return this;
  }
  /**
   * Set the project ID for this workflow
   */
  inProject(projectId: string): this {
    this.projectId = projectId;
    this.workflowData.projectId = projectId;
    return this;
  }
  /**
   * Override any workflow properties
   */
  with(overrides: Record<string, unknown>): this {
    Object.assign(this.workflowData, overrides);
    return this;
  }
  /**
   * Add a page to this workflow
   * @param title Page title
   * @param configureFn Optional function to configure the page
   */
  addPage(title: string, configureFn?: (page: PageBuilder) => void): this {
    const page = new PageBuilder(title, this.pages.length);
    if (configureFn) {
      configureFn(page);
    }
    this.pages.push(page);
    return this;
  }
  /**
   * Build the complete workflow into the database
   * @param database Database instance to use
   * @returns Complete workflow with pages and steps
   */
  async build(database: Database = db): Promise<{
    workflow: Record<string, unknown>;
    pages: Array<{ page: Record<string, unknown>; steps: Record<string, unknown>[] }>;
  }> {
    // Insert workflow
    const [workflow] = await database
      .insert(schema.workflows)
      .values(this.workflowData)
      .returning();
    // Insert all pages and their steps
    const builtPages = [];
    for (const pageBuilder of this.pages) {
      const result = await pageBuilder.build(database, workflow.id);
      builtPages.push(result);
    }
    return {
      workflow,
      pages: builtPages,
    };
  }
  /**
   * Get data without inserting to database
   */
  getData() {
    return {
      workflow: this.workflowData,
      pages: this.pages.map(s => s.getData()),
    };
  }
}
// ===================================================================
// Complete Test Environment Builder
// ===================================================================
/**
 * Builder for creating a complete test environment with tenant, org, user, project, and workflow
 */
export class TestEnvironmentBuilder {
  private tenantData: ReturnType<typeof createTestTenant>;
  private orgData: ReturnType<typeof createTestOrganization>;
  private userData: ReturnType<typeof createTestUser>;
  private projectData: ReturnType<typeof createTestProject>;
  private workflowBuilder?: WorkflowBuilder;
  constructor() {
    this.tenantData = createTestTenant();
    this.orgData = createTestOrganization();
    this.userData = createTestUser();
    this.projectData = createTestProject();
  }
  /**
   * Configure the tenant
   */
  withTenant(overrides: Record<string, unknown>): this {
    Object.assign(this.tenantData, overrides);
    return this;
  }
  /**
   * Configure the organization
   */
  withOrganization(overrides: Record<string, unknown>): this {
    Object.assign(this.orgData, overrides);
    return this;
  }
  /**
   * Configure the user
   */
  withUser(overrides: Record<string, unknown>): this {
    Object.assign(this.userData, overrides);
    return this;
  }
  /**
   * Configure the project
   */
  withProject(overrides: Record<string, unknown>): this {
    Object.assign(this.projectData, overrides);
    return this;
  }
  /**
   * Add a workflow to this environment
   */
  withWorkflow(configureFn: (builder: WorkflowBuilder) => void): this {
    this.workflowBuilder = new WorkflowBuilder();
    configureFn(this.workflowBuilder);
    return this;
  }
  /**
   * Build the complete test environment
   * @param database Database instance to use
   * @returns Complete test environment
   */
  async build(database: Database = db): Promise<{
    tenant: Record<string, unknown>;
    organization: Record<string, unknown>;
    user: Record<string, unknown>;
    project: Record<string, unknown>;
    workflow?: { workflow: Record<string, unknown>; pages: Array<{ page: Record<string, unknown>; steps: Record<string, unknown>[] }> };
  }> {
    // Insert tenant
    const [tenant] = await database
      .insert(schema.tenants)
      .values(this.tenantData as any)
      .returning();
    // Insert organization
    const [organization] = await database
      .insert(schema.organizations)
      .values({ ...this.orgData, tenantId: tenant.id } as any)
      .returning();
    // Insert user
    const [user] = await database
      .insert(schema.users)
      .values({ ...this.userData, tenantId: tenant.id } as any)
      .returning();
    // Add user to organization
    await database.insert(schema.organizationMemberships).values({
      orgId: organization.id,
      userId: user.id,
      role: 'admin',
    });
    // Insert project
    const [project] = await database
      .insert(schema.projects)
      .values({
        ...this.projectData,
        ownerType: 'org',
        ownerUuid: organization.id,
        ownerId: user.id, // Explicitly set ownerId to creator for org-owned projects
      } as any)
      .returning();
    // Insert workflow if configured
    let workflow;
    if (this.workflowBuilder) {
      this.workflowBuilder.inProject(project.id);
      workflow = await this.workflowBuilder.build(database);
    }
    return {
      tenant,
      organization,
      user,
      project,
      workflow,
    };
  }
}
// ===================================================================
// Convenience Functions
// ===================================================================
/**
 * Create a simple workflow with basic structure
 */
export async function createSimpleWorkflow(
  database: Database = db,
  options?: {
    title?: string;
    projectId?: string;
    pageCount?: number;
    stepsPerPage?: number;
  }
): Promise<{ workflow: any; pages: Array<{ page: any; steps: any[] }> }> {
  const builder = new WorkflowBuilder(options?.title);
  if (options?.projectId) {
    builder.inProject(options.projectId);
  }
  const pageCount = options?.pageCount || 2;
  const stepsPerPage = options?.stepsPerPage || 3;
  for (let i = 0; i < pageCount; i++) {
    builder.addPage(`Page ${i + 1}`, (page) => {
      for (let j = 0; j < stepsPerPage; j++) {
        page.addStep('text', {
          alias: `page${i + 1}_step${j + 1}`,
          title: `Step ${j + 1}`,
        });
      }
    });
  }
  return builder.build(database);
}
