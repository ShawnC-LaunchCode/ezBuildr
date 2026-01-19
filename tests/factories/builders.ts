/**
 * Test Data Builders
 *
 * Provides builder pattern classes for constructing complex test objects
 * with fluent interfaces. Builders are useful when you need to create
 * interconnected objects (workflows with sections and steps) or when
 * you need to build up test data incrementally.
 *
 * Usage:
 * ```ts
 * const workflow = await new WorkflowBuilder()
 *   .withTitle('My Workflow')
 *   .addSection('Contact Info', (section) => {
 *     section
 *       .addStep('short_text', { alias: 'name', title: 'Name' })
 *       .addStep('email', { alias: 'email', title: 'Email' });
 *   })
 *   .addSection('Details', (section) => {
 *     section.addStep('long_text', { alias: 'description' });
 *   })
 *   .build(db);
 * ```
 */
import * as schema from '@shared/schema';
import { db } from '../../server/db';
import {
  createTestWorkflow,
  createTestSection, // Added back
  createTestStep,
  createTestWorkflowRun,
  createTestStepValue,
  createTestProject,
  createTestTenant,
  createTestOrganization,
  createTestUser,
  type DeepPartial,
} from './index';
type Database = typeof db;
// ===================================================================
// Section Builder
// ===================================================================
/**
 * Builder for creating a section with multiple steps
 */
export class SectionBuilder {
  private sectionData: ReturnType<typeof createTestSection>;
  private steps: Array<ReturnType<typeof createTestStep>> = [];
  constructor(title: string, order: number = 0) {
    this.sectionData = createTestSection({ title, order });
  }
  /**
   * Override section properties
   */
  with(overrides: any): this {
    Object.assign(this.sectionData, overrides);
    return this;
  }
  /**
   * Add a step to this section
   * @param type Step type (e.g., 'short_text', 'email', 'phone')
   * @param overrides Additional step properties
   */
  addStep(type: string, overrides?: any): this {
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
  addSteps(steps: Array<{ type: string; overrides?: any }>): this {
    for (const step of steps) {
      this.addStep(step.type, step.overrides);
    }
    return this;
  }
  /**
   * Internal: Build section and steps into database
   */
  async build(db: Database, workflowId: string): Promise<{ section: any; steps: any[] }> {
    // Insert section
    const [section] = await db
      .insert(schema.sections)
      .values({ ...this.sectionData, workflowId })
      .returning();
    // Insert all steps
    const insertedSteps = [];
    for (const stepData of this.steps) {
      const [step] = await db
        .insert(schema.steps)
        .values({ ...stepData, sectionId: section.id })
        .returning();
      insertedSteps.push(step);
    }
    return { section, steps: insertedSteps };
  }
  /**
   * Get data without inserting to database
   */
  getData() {
    return {
      section: this.sectionData,
      steps: this.steps,
    };
  }
}
// ===================================================================
// Workflow Builder
// ===================================================================
/**
 * Builder for creating a complete workflow with sections and steps
 */
export class WorkflowBuilder {
  private workflowData: ReturnType<typeof createTestWorkflow>;
  private sections: SectionBuilder[] = [];
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
  with(overrides: any): this {
    Object.assign(this.workflowData, overrides);
    return this;
  }
  /**
   * Add a section to this workflow
   * @param title Section title
   * @param configureFn Optional function to configure the section
   */
  addSection(title: string, configureFn?: (section: SectionBuilder) => void): this {
    const section = new SectionBuilder(title, this.sections.length);
    if (configureFn) {
      configureFn(section);
    }
    this.sections.push(section);
    return this;
  }
  /**
   * Build the complete workflow into the database
   * @param database Database instance to use
   * @returns Complete workflow with sections and steps
   */
  async build(database: Database = db): Promise<{
    workflow: any;
    sections: Array<{ section: any; steps: any[] }>;
  }> {
    // Insert workflow
    const [workflow] = await database
      .insert(schema.workflows)
      .values(this.workflowData)
      .returning();
    // Insert all sections and their steps
    const builtSections = [];
    for (const sectionBuilder of this.sections) {
      const result = await sectionBuilder.build(database, workflow.id);
      builtSections.push(result);
    }
    return {
      workflow,
      sections: builtSections,
    };
  }
  /**
   * Get data without inserting to database
   */
  getData() {
    return {
      workflow: this.workflowData,
      sections: this.sections.map(s => s.getData()),
    };
  }
}
// ===================================================================
// Run Builder
// ===================================================================
/**
 * Builder for creating a workflow run with step values
 */
export class RunBuilder {
  private runData: ReturnType<typeof createTestWorkflowRun>;
  private stepValues: Map<string, any> = new Map();
  private workflowId?: string;
  constructor(workflowId?: string) {
    this.runData = createTestWorkflowRun(workflowId ? { workflowId } : undefined);
    this.workflowId = workflowId;
  }
  /**
   * Set the workflow for this run
   */
  forWorkflow(workflowId: string): this {
    this.workflowId = workflowId;
    this.runData.workflowId = workflowId;
    return this;
  }
  /**
   * Set the user who created this run
   */
  byUser(userId: string): this {
    this.runData.createdBy = `creator:${userId}`;
    return this;
  }
  /**
   * Make this an anonymous run
   */
  anonymous(): this {
    this.runData.createdBy = 'anon';
    return this;
  }
  /**
   * Mark this run as completed
   */
  completed(completedAt?: Date): this {
    this.runData.completed = true;
    this.runData.completedAt = completedAt || new Date();
    this.runData.progress = 100;
    return this;
  }
  /**
   * Set progress percentage
   */
  withProgress(progress: number): this {
    this.runData.progress = progress;
    return this;
  }
  /**
   * Add a step value to this run
   * @param stepId Step ID or alias
   * @param value The value to store
   */
  addValue(stepId: string, value: any): this {
    this.stepValues.set(stepId, value);
    return this;
  }
  /**
   * Add multiple step values at once
   */
  addValues(values: Record<string, any>): this {
    for (const [stepId, value] of Object.entries(values)) {
      this.stepValues.set(stepId, value);
    }
    return this;
  }
  /**
   * Override any run properties
   */
  with(overrides: any): this {
    Object.assign(this.runData, overrides);
    return this;
  }
  /**
   * Build the run into the database
   * @param database Database instance to use
   * @returns Run with step values
   */
  async build(database: Database = db): Promise<{
    run: any;
    stepValues: any[];
  }> {
    if (!this.workflowId) {
      throw new Error('WorkflowId is required. Use forWorkflow() or pass workflowId to constructor.');
    }
    // Insert run
    const [run] = await database
      .insert(schema.runs)
      .values(this.runData as any)
      .returning();
    // Insert step values
    const insertedStepValues = [];
    for (const [stepId, value] of this.stepValues.entries()) {
      const [stepValue] = await database
        .insert(schema.stepValues)
        .values({
          runId: run.id,
          stepId,
          value,
        })
        .returning();
      insertedStepValues.push(stepValue);
    }
    return {
      run,
      stepValues: insertedStepValues,
    };
  }
  /**
   * Get data without inserting to database
   */
  getData() {
    return {
      run: this.runData,
      stepValues: Array.from(this.stepValues.entries()).map(([stepId, value]) => ({
        stepId,
        value,
      })),
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
  withTenant(overrides: any): this {
    Object.assign(this.tenantData, overrides);
    return this;
  }
  /**
   * Configure the organization
   */
  withOrganization(overrides: any): this {
    Object.assign(this.orgData, overrides);
    return this;
  }
  /**
   * Configure the user
   */
  withUser(overrides: any): this {
    Object.assign(this.userData, overrides);
    return this;
  }
  /**
   * Configure the project
   */
  withProject(overrides: any): this {
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
    tenant: any;
    organization: any;
    user: any;
    project: any;
    workflow?: { workflow: any; sections: Array<{ section: any; steps: any[] }> };
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
    sectionCount?: number;
    stepsPerSection?: number;
  }
): Promise<{ workflow: any; sections: Array<{ section: any; steps: any[] }> }> {
  const builder = new WorkflowBuilder(options?.title);
  if (options?.projectId) {
    builder.inProject(options.projectId);
  }
  const sectionCount = options?.sectionCount || 2;
  const stepsPerSection = options?.stepsPerSection || 3;
  for (let i = 0; i < sectionCount; i++) {
    builder.addSection(`Section ${i + 1}`, (section) => {
      for (let j = 0; j < stepsPerSection; j++) {
        section.addStep('short_text', {
          alias: `section${i + 1}_step${j + 1}`,
          title: `Step ${j + 1}`,
        });
      }
    });
  }
  return builder.build(database);
}
/**
 * Create a complete test run with sample data
 */
export async function createCompleteRun(
  database: Database = db,
  workflowId: string,
  stepIds: string[],
  options?: {
    userId?: string;
    completed?: boolean;
  }
): Promise<{ run: any; stepValues: any[] }> {
  const builder = new RunBuilder(workflowId);
  if (options?.userId) {
    builder.byUser(options.userId);
  } else {
    builder.anonymous();
  }
  if (options?.completed) {
    builder.completed();
  }
  // Add sample values for each step
  for (const stepId of stepIds) {
    builder.addValue(stepId, `Sample value for ${stepId}`);
  }
  return builder.build(database);
}