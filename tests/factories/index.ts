/**
 * Test Data Factory Library
 *
 * Provides factory functions for generating realistic test data with sensible defaults
 * and support for partial overrides. All factories are TypeScript-typed and designed
 * to work seamlessly with the Drizzle ORM schema.
 *
 * Usage:
 * ```ts
 * const user = createTestUser({ email: 'custom@example.com' });
 * const project = createTestProject({ name: 'My Custom Project', ownerId: user.id });
 * const workflow = createTestWorkflow({ projectId: project.id });
 * ```
 */

import { nanoid } from 'nanoid';
import { v4 as uuidv4 } from 'uuid';

import { buildTestWhen } from '../helpers/conditionFixtures';

import type {
  users,
  tenants,
  organizations,
  projects,
  workflows,
  pages,
  steps,
  workflowRuns,
  stepValues,
  logicRules,
  transformBlocks,
} from '@shared/schema';

// Derive types if not exported (common with Drizzle schema generic exports)
type User = typeof users.$inferSelect;
type Tenant = typeof tenants.$inferSelect;
type Organization = typeof organizations.$inferSelect;
type Project = typeof projects.$inferSelect;
type Workflow = typeof workflows.$inferSelect;
type Page = typeof pages.$inferSelect;
type Step = typeof steps.$inferSelect;
type WorkflowRun = typeof workflowRuns.$inferSelect;
type StepValue = typeof stepValues.$inferSelect;
type LogicRule = typeof logicRules.$inferSelect;
type TransformBlock = typeof transformBlocks.$inferSelect;

// ===================================================================
// Type Definitions
// ===================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ===================================================================
// User Factories
// ===================================================================

/**
 * Creates a test user with realistic defaults
 * @param overrides Partial user properties to override defaults
 * @returns User object ready for database insertion
 */
export function createTestUser(overrides?: DeepPartial<User>): Omit<User, 'id' | 'createdAt' | 'updatedAt'> {
  const uniqueId = nanoid(8);
  const firstName = overrides?.firstName || `Test${uniqueId}`;
  const lastName = overrides?.lastName || 'User';

  return {
    email: overrides?.email || `test-${uniqueId}@example.com`,
    fullName: overrides?.fullName || `${firstName} ${lastName}`,
    firstName,
    lastName,
    profileImageUrl: overrides?.profileImageUrl || null,
    tenantId: overrides?.tenantId || null,
    role: overrides?.role || 'creator',
    tenantRole: overrides?.tenantRole || 'builder',
    authProvider: overrides?.authProvider || 'local',
    defaultMode: overrides?.defaultMode || 'easy',
    emailVerified: overrides?.emailVerified ?? true,
    isActive: overrides?.isActive ?? true,
    mfaEnabled: overrides?.mfaEnabled ?? false,
    lastPasswordChange: overrides?.lastPasswordChange || null,
    isPlaceholder: overrides?.isPlaceholder ?? false,
    placeholderEmail: overrides?.placeholderEmail || null,
    ...overrides,
  };
}

/**
 * Creates test user credentials (password hash)
 * @param userId User ID to associate credentials with
 * @param overrides Optional overrides
 */
export function createTestUserCredentials(
  userId: string,
  overrides?: { passwordHash?: string }
): { userId: string; passwordHash: string } {
  return {
    userId,
    passwordHash: overrides?.passwordHash || '$2b$10$testHashedPassword123456789',
  };
}

// ===================================================================
// Tenant & Organization Factories
// ===================================================================

/**
 * Creates a test tenant
 * @param overrides Partial tenant properties
 */
export function createTestTenant(overrides?: DeepPartial<Tenant>): Omit<Tenant, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: overrides?.name || `Test Tenant ${nanoid(6)}`,
    billingEmail: overrides?.billingEmail || generateEmail(),
    plan: overrides?.plan || 'pro',
    mfaRequired: overrides?.mfaRequired ?? false,
    branding: overrides?.branding || null,
    ...overrides,
  };
}

/**
 * Creates a test organization
 * @param overrides Partial organization properties
 */
export function createTestOrganization(overrides?: DeepPartial<Organization>): Omit<Organization, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    ...overrides,
    name: overrides?.name || `Test Organization ${nanoid(6)}`,
    description: overrides?.description || `A test organization for automated testing`,
    slug: overrides?.slug || null,
    domain: overrides?.domain || null,
    settings: overrides?.settings || {},
    createdByUserId: overrides?.createdByUserId || null,
    tenantId: overrides?.tenantId || uuidv4(), // Fix: nanoid -> uuidv4
  };
}

// ===================================================================
// Project Factories
// ===================================================================

/**
 * Creates a test project with realistic defaults
 * @param overrides Partial project properties to override defaults
 * @returns Project object ready for database insertion
 */
export function createTestProject(overrides?: DeepPartial<Project>): Omit<Project, 'id' | 'createdAt' | 'updatedAt'> {
  const uniqueId = nanoid(8);
  return {
    ...overrides,
    title: overrides?.title ?? `Project ${uniqueId}`,
    name: overrides?.name ?? `Project ${uniqueId}`,
    description: overrides?.description || null,
    creatorId: overrides?.creatorId || `user-${uniqueId}`,
    tenantId: overrides?.tenantId || null,
    createdBy: overrides?.createdBy || null,
    ownerId: overrides?.ownerId || `user-${uniqueId}`,
    ownerType: overrides?.ownerType || 'user',
    ownerUuid: overrides?.ownerUuid || uuidv4(), // Fix: user-${uniqueId} -> uuidv4()
    status: overrides?.status || 'active',
    archived: overrides?.archived ?? false,
  };
}

// ===================================================================
// Workflow Factories
// ===================================================================

/**
 * Creates a test workflow with realistic defaults
 * @param overrides Partial workflow properties to override defaults
 * @returns Workflow object ready for database insertion
 */
export function createTestWorkflow(overrides?: DeepPartial<Workflow>): Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'> {
  const uniqueId = nanoid(8);

  return {
    ...overrides,
    projectId: overrides?.projectId || null,
    title: overrides?.title || `Test Workflow ${uniqueId}`,
    name: overrides?.name || null,
    description: overrides?.description || 'A test workflow for automated testing',
    creatorId: overrides?.creatorId || null,
    ownerId: overrides?.ownerId || overrides?.creatorId || uuidv4(), // Fix: default to uuidv4
    ownerUuid: overrides?.ownerUuid || uuidv4(), // Fix: default to uuidv4
    status: overrides?.status || 'draft',
    pinnedVersionId: overrides?.pinnedVersionId || null,
    isPublic: overrides?.isPublic ?? false,
    requireLogin: overrides?.requireLogin ?? true,
    publicLink: overrides?.publicLink || null,
    slug: overrides?.slug || nanoid(10),
    modeOverride: overrides?.modeOverride || null,
    currentVersionId: overrides?.currentVersionId || null,
    intakeConfig: overrides?.intakeConfig || {},
    settings: overrides?.settings || {},
    sourceBlueprintId: overrides?.sourceBlueprintId || null,
    ownerType: overrides?.ownerType || 'user',
  };
}

/**
 * Creates a test page (page) for a workflow
 * @param overrides Partial page properties to override defaults
 * @returns Page object ready for database insertion
 */
export function createTestPage(overrides?: DeepPartial<Page>): Omit<Page, 'id' | 'createdAt' | 'updatedAt'> {
  const uniqueId = nanoid(8);
  return {
    workflowId: overrides?.workflowId || uuidv4(), // Fix: wf-${uniqueId} -> uuidv4
    title: overrides?.title || `Page ${uniqueId}`,
    description: overrides?.description || null,
    order: overrides?.order ?? 0,
    sectionId: overrides?.sectionId ?? null,
    visibleIf: overrides?.visibleIf || null,
    config: overrides?.config || {},
    deletedAt: overrides?.deletedAt ?? null,
    ...overrides,
  };
}

/**
 * Creates a test step (question/action) for a page
 * @param overrides Partial step properties to override defaults
 * @returns Step object ready for database insertion
 */
export function createTestStep(overrides?: DeepPartial<Step>): Omit<Step, 'id' | 'createdAt' | 'updatedAt'> {
  const uniqueId = nanoid(8);

  return {
    workflowId: overrides?.workflowId || uuidv4(),
    pageId: overrides?.pageId || uuidv4(), // Fix: page-${uniqueId} -> uuidv4
    type: overrides?.type || 'text',
    title: overrides?.title || `Step ${uniqueId}`,
    description: overrides?.description || null,
    required: overrides?.required ?? false,
    config: overrides?.config || null,
    alias: overrides?.alias || null,
    defaultValue: overrides?.defaultValue || null,
    order: overrides?.order ?? 0,
    isVirtual: overrides?.isVirtual ?? false,
    visibleIf: overrides?.visibleIf || null,
    deletedAt: overrides?.deletedAt ?? null,
    ...overrides,
  };
}

// ===================================================================
// Run & Data Factories
// ===================================================================

/**
 * Creates a test workflow run
 * @param overrides Partial run properties to override defaults
 * @returns WorkflowRun object ready for database insertion
 */
export function createTestWorkflowRun(overrides?: DeepPartial<WorkflowRun>): Omit<WorkflowRun, 'id' | 'createdAt' | 'updatedAt'> {
  const uniqueId = nanoid(8);

  const defaults = {
    workflowId: uuidv4(),
    runToken: uniqueId,
    createdBy: `creator:${uniqueId}`,
    workflowVersionId: null,
    progress: 0,
    completed: false,
    completedAt: null,
    currentPageId: null,
    metadata: {},
    clientEmail: null,
    assignedToUserId: null,
    assignmentUpdatedAt: null,
    portalAccessKey: null,
    accessMode: 'anonymous' as const,
    shareToken: nanoid(),
    shareTokenExpiresAt: null,
    ownerType: null,
    ownerUuid: null,
  };

  return { ...defaults, ...overrides } as Omit<WorkflowRun, 'id' | 'createdAt' | 'updatedAt'>;
}

/**
 * Creates a test step value (answer)
 * @param overrides Partial step value properties to override defaults
 * @returns StepValue object ready for database insertion
 */
export function createTestStepValue(overrides?: DeepPartial<StepValue>): Omit<StepValue, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    runId: overrides?.runId || uuidv4(), // Fix: run-${nanoid} -> uuidv4
    stepId: overrides?.stepId || uuidv4(), // Fix: step-${nanoid} -> uuidv4
    value: overrides?.value || null,
    ...overrides,
  };
}

// ===================================================================
// Logic & Transform Factories
// ===================================================================

/**
 * Creates a test logic rule
 * @param overrides Partial logic rule properties
 */
export function createTestLogicRule(overrides?: DeepPartial<LogicRule>): Omit<LogicRule, 'id' | 'createdAt' | 'updatedAt'> {
  const conditionStepId = overrides?.conditionStepId || uuidv4();
  return {
    workflowId: overrides?.workflowId || uuidv4(),
    conditionStepId,
    when: overrides?.when ?? buildTestWhen(conditionStepId, 'equals', 'test_value'),
    targetType: overrides?.targetType || 'step',
    targetStepId: overrides?.targetStepId || uuidv4(),
    targetPageId: overrides?.targetPageId || null,
    action: overrides?.action || 'show',
    order: overrides?.order ?? 1,
  };
}

/**
 * Creates a test transform block
 * @param overrides Partial transform block properties
 */
export function createTestTransformBlock(overrides?: DeepPartial<TransformBlock>): Omit<TransformBlock, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    workflowId: overrides?.workflowId || uuidv4(),
    pageId: overrides?.pageId || null,
    name: overrides?.name || `Transform ${nanoid(6)}`,
    code: overrides?.code || 'emit({ result: input.value * 2 });',
    language: overrides?.language || 'javascript',
    inputKeys: (overrides?.inputKeys as string[]) || ['value'],
    outputKey: overrides?.outputKey || 'doubled',
    virtualStepId: overrides?.virtualStepId || null,
    phase: overrides?.phase || 'onPageSubmit',
    enabled: overrides?.enabled ?? true,
    order: overrides?.order ?? 0,
    timeoutMs: overrides?.timeoutMs || 1000,
  };
}

// ===================================================================
// Batch Creation Helpers
// ===================================================================

/**
 * Creates multiple test users at once
 * @param count Number of users to create
 * @param overrides Common overrides for all users
 */
export function createTestUsers(count: number, overrides?: DeepPartial<User>): Array<Omit<User, 'id' | 'createdAt' | 'updatedAt'>> {
  return Array.from({ length: count }, () => createTestUser(overrides));
}

/**
 * Creates multiple test projects at once
 * @param count Number of projects to create
 * @param overrides Common overrides for all projects
 */
export function createTestProjects(count: number, overrides?: DeepPartial<Project>): Array<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>> {
  return Array.from({ length: count }, () => createTestProject(overrides));
}

/**
 * Creates multiple test pages at once
 * @param count Number of pages to create
 * @param workflowId Workflow ID to associate pages with
 * @param overrides Common overrides for all pages
 */
export function createTestPages(
  count: number,
  workflowId: string,
  overrides?: DeepPartial<Page>
): Array<Omit<Page, 'id' | 'createdAt' | 'updatedAt'>> {
  return Array.from({ length: count }, (_, index) =>
    createTestPage({
      workflowId,
      order: index,
      title: `Page ${index + 1}`,
      ...overrides,
    })
  );
}

/**
 * Creates multiple test steps at once
 * @param count Number of steps to create
 * @param pageId Page ID to associate steps with
 * @param overrides Common overrides for all steps
 */
export function createTestSteps(
  count: number,
  pageId: string,
  overrides?: DeepPartial<Step>
): Array<Omit<Step, 'id' | 'createdAt' | 'updatedAt'>> {
  const workflowId = overrides?.workflowId || uuidv4();
  return Array.from({ length: count }, (_, index) =>
    createTestStep({
      pageId,
      workflowId,
      order: index,
      alias: `step_${index + 1}`,
      ...overrides,
    })
  );
}

// ===================================================================
// Realistic Data Generators
// ===================================================================

/**
 * Generates a realistic email address
 */
export function generateEmail(prefix?: string): string {
  const domain = ['example.com', 'test.com', 'demo.com'][Math.floor(Math.random() * 3)];
  return `${prefix || nanoid(8)}@${domain}`;
}

/**
 * Generates a realistic phone number
 */
export function generatePhoneNumber(): string {
  const area = Math.floor(Math.random() * 900) + 100;
  const exchange = Math.floor(Math.random() * 900) + 100;
  const number = Math.floor(Math.random() * 9000) + 1000;
  return `${area}-${exchange}-${number}`;
}

/**
 * Generates a realistic address
 */
export function generateAddress() {
  const streets = ['Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Elm Blvd'];
  const cities = ['Springfield', 'Riverside', 'Madison', 'Franklin', 'Georgetown'];
  const states = ['CA', 'NY', 'TX', 'FL', 'WA'];

  return {
    street: `${Math.floor(Math.random() * 9999) + 1} ${streets[Math.floor(Math.random() * streets.length)]}`,
    city: cities[Math.floor(Math.random() * cities.length)],
    state: states[Math.floor(Math.random() * states.length)],
    zip: String(Math.floor(Math.random() * 90000) + 10000),
  };
}

/**
 * Generates realistic workflow step values
 */
export function generateStepValues(stepTypes: Array<{ id: string; type: string }>): Record<string, any> {
  const values: Record<string, any> = {};

  for (const step of stepTypes) {
    switch (step.type) {
      case 'text':
        values[step.id] = `Sample text for ${step.id}`;
        break;
      case 'email':
        values[step.id] = generateEmail();
        break;
      case 'phone':
        values[step.id] = generatePhoneNumber();
        break;
      case 'number':
        values[step.id] = Math.floor(Math.random() * 1000);
        break;
      case 'boolean':
      case 'yes_no':
        values[step.id] = Math.random() > 0.5;
        break;
      case 'date':
        values[step.id] = new Date().toISOString().split('T')[0];
        break;
      case 'date_time':
        values[step.id] = new Date().toISOString();
        break;
      case 'address':
        values[step.id] = generateAddress();
        break;
      case 'radio':
      case 'multiple_choice':
        values[step.id] = 'option1';
        break;
      case 'checkbox':
        values[step.id] = ['option1', 'option2'];
        break;
      case 'scale':
        values[step.id] = Math.floor(Math.random() * 5) + 1;
        break;
      default:
        values[step.id] = null;
    }
  }

  return values;
}
