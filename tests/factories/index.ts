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

import type {
  users, // Added missing import
  tenants,
  organizations,
  projects,
  workflows,
  sections,
  steps,
  workflowRuns, // Updated from runs to workflowRuns which matches the factory usage
  stepValues,
} from '@shared/schema';

// Derive types if not exported (common with Drizzle schema generic exports)
type User = typeof users.$inferSelect;
type Tenant = typeof tenants.$inferSelect;
type Organization = typeof organizations.$inferSelect;
type Project = typeof projects.$inferSelect;
type Workflow = typeof workflows.$inferSelect;
type Section = typeof sections.$inferSelect;
type Step = typeof steps.$inferSelect;
type WorkflowRun = typeof workflowRuns.$inferSelect; // Updated type
type StepValue = typeof stepValues.$inferSelect;

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
    // slug: overrides?.slug || `tenant-${nanoid(8)}`, // Removed: does not exist on schema
    billingEmail: overrides?.billingEmail || generateEmail(), // Ensure string
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
    domain: overrides?.domain || null, // Explicitly handle domain
    settings: overrides?.settings || {},
    createdByUserId: overrides?.createdByUserId || null,
    tenantId: overrides?.tenantId || nanoid(),
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
    ownerUuid: overrides?.ownerUuid || `user-${uniqueId}`,
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
export function createTestWorkflow(overrides?: DeepPartial<Workflow>): any {
  const uniqueId = nanoid(8);

  return {
    ...overrides,
    projectId: overrides?.projectId || null,
    title: overrides?.title || `Test Workflow ${uniqueId}`,
    name: overrides?.name || null,
    description: overrides?.description || 'A test workflow for automated testing',
    creatorId: (overrides?.creatorId ?? null) as any, // Optional field
    ownerId: (overrides?.ownerId ?? overrides?.creatorId ?? `user-${uniqueId}`) as any, // Ensure ownerId is populated per schema constraints
    ownerUuid: overrides?.ownerUuid || `user-${uniqueId}`,
    status: overrides?.status || 'draft',
    pinnedVersionId: overrides?.pinnedVersionId || null,
    isPublic: overrides?.isPublic ?? false,
    requireLogin: overrides?.requireLogin ?? true,
    publicLink: overrides?.publicLink || null,
    slug: overrides?.slug || nanoid(10),
    modeOverride: overrides?.modeOverride || null,
    currentVersionId: overrides?.currentVersionId || null,
    intakeConfig: overrides?.intakeConfig || {},
    sourceBlueprintId: overrides?.sourceBlueprintId || null,
  };
}

/**
 * Creates a test section (page) for a workflow
 * @param overrides Partial section properties to override defaults
 * @returns Section object ready for database insertion
 */
export function createTestSection(overrides?: DeepPartial<Section>): Omit<Section, 'id' | 'createdAt' | 'updatedAt'> {
  const uniqueId = nanoid(8);
  return {
    workflowId: overrides?.workflowId || `wf-${uniqueId}`,
    title: overrides?.title || `Section ${uniqueId}`,
    description: overrides?.description || null,
    order: overrides?.order ?? 0,
    skipIf: overrides?.skipIf || null, // Renamed from skipLogic if needed, or if unrelated. Schema has skipIf.
    // skipLogic: overrides?.skipLogic || null, // Removed
    visibleIf: overrides?.visibleIf || null,
    config: overrides?.config || {},
    ...overrides,
  };
}

/**
 * Creates a test step (question/action) for a section
 * @param overrides Partial step properties to override defaults
 * @returns Step object ready for database insertion
 */
export function createTestStep(overrides?: DeepPartial<Step>): Omit<Step, 'id' | 'createdAt' | 'updatedAt'> {
  const uniqueId = nanoid(8);

  return {
    sectionId: overrides?.sectionId || `sec-${uniqueId}`,
    type: overrides?.type || 'short_text',
    title: overrides?.title || `Step ${uniqueId}`, // label -> title
    // label: overrides?.label || `Test ${stepType} step`, // Removed
    description: overrides?.description || null,
    required: overrides?.required ?? false,
    options: overrides?.options || null,
    alias: overrides?.alias || null,
    defaultValue: overrides?.defaultValue || null,
    order: overrides?.order ?? 0,
    isVirtual: overrides?.isVirtual ?? false,
    visibleIf: overrides?.visibleIf || null,
    repeaterConfig: overrides?.repeaterConfig || null,
    // config: overrides?.config || {}, // Removed
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

  return {
    ...overrides,
    workflowId: overrides?.workflowId || `wf-${uniqueId}`,
    runToken: overrides?.runToken || uniqueId,
    createdBy: overrides?.createdBy || `creator:${uniqueId}`,
    workflowVersionId: overrides?.workflowVersionId || null,
    progress: overrides?.progress || 0,
    completed: overrides?.completed ?? false,
    completedAt: overrides?.completedAt || null,
    currentSectionId: overrides?.currentSectionId || null,
    metadata: overrides?.metadata || {},
    clientEmail: overrides?.clientEmail || null,
    portalAccessKey: overrides?.portalAccessKey || null,
    accessMode: overrides?.accessMode || 'anonymous',
    shareToken: overrides?.shareToken || nanoid(),
    shareTokenExpiresAt: overrides?.shareTokenExpiresAt || null,
    ownerType: overrides?.ownerType || null,
    ownerUuid: overrides?.ownerUuid || null,
  };
}

/**
 * Creates a test step value (answer)
 * @param overrides Partial step value properties to override defaults
 * @returns StepValue object ready for database insertion
 */
export function createTestStepValue(overrides?: DeepPartial<StepValue>): Omit<StepValue, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    runId: overrides?.runId || `run-${nanoid(8)}`,
    stepId: overrides?.stepId || `step-${nanoid(8)}`,
    value: overrides?.value || null,
    ...overrides,
  };
}

// ===================================================================
// DataVault Factories
// ===================================================================

/*
// DataVault factories commented out as tables are currently missing in schema export
export function createTestDatabase(overrides?: DeepPartial<Database>): Omit<Database, 'id' | 'createdAt' | 'updatedAt'> {
  const uniqueId = nanoid(8);

  return {
    name: overrides?.name || `Database ${uniqueId}`,
    description: overrides?.description || null,
    tenantId: overrides?.tenantId || `tenant-${uniqueId}`,
    scopeType: overrides?.scopeType || 'project',
    scopeId: overrides?.scopeId || `proj-${uniqueId}`,
    ...overrides,
  };
}

export function createTestTable(overrides?: DeepPartial<Table>): Omit<Table, 'id' | 'createdAt' | 'updatedAt'> {
  const uniqueId = nanoid(8);

  return {
    databaseId: overrides?.databaseId || `db-${uniqueId}`,
    name: overrides?.name || `Table ${uniqueId}`,
    description: overrides?.description || null,
    role: overrides?.role || 'read',
    schema: overrides?.schema || {},
    ...overrides,
  };
}

export function createTestTableRow(overrides?: DeepPartial<TableRow>): Omit<TableRow, 'id' | 'createdAt' | 'updatedAt'> {
  const uniqueId = nanoid(8);

  return {
    tableId: overrides?.tableId || `table-${uniqueId}`,
    data: overrides?.data || {},
    ...overrides,
  };
}
*/
/**
 * Creates a test database
 * @param overrides Partial database properties to override defaults
 * @returns Database object ready for database insertion
 */
// Duplicate DataVault factories removed

// ===================================================================
// Logic & Transform Factories
// ===================================================================

/**
 * Creates a test logic rule
 * @param overrides Partial logic rule properties
 */
export function createTestLogicRule(overrides?: {
  workflowId?: string;
  condition?: any;
  action?: any;
  order?: number;
}) {
  return {
    workflowId: overrides?.workflowId || null,
    condition: overrides?.condition || {
      type: 'simple',
      field: 'step_email',
      operator: 'equals',
      value: 'test@example.com',
    },
    action: overrides?.action || {
      type: 'show',
      targetId: 'step_phone',
    },
    order: overrides?.order ?? 0,
  };
}

/**
 * Creates a test transform block
 * @param overrides Partial transform block properties
 */
export function createTestTransformBlock(overrides?: {
  workflowId?: string;
  code?: string;
  language?: 'javascript' | 'python';
  inputKeys?: string[];
  outputKey?: string;
}) {
  return {
    workflowId: overrides?.workflowId || null,
    name: `Transform ${nanoid(6)}`,
    code: overrides?.code || 'emit({ result: input.value * 2 });',
    language: overrides?.language || 'javascript',
    inputKeys: overrides?.inputKeys || ['value'],
    outputKey: overrides?.outputKey || 'doubled',
    virtualStepId: null,
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
 * Creates multiple test sections at once
 * @param count Number of sections to create
 * @param workflowId Workflow ID to associate sections with
 * @param overrides Common overrides for all sections
 */
export function createTestSections(
  count: number,
  workflowId: string,
  overrides?: DeepPartial<Section>
): Array<Omit<Section, 'id' | 'createdAt' | 'updatedAt'>> {
  return Array.from({ length: count }, (_, index) =>
    createTestSection({
      workflowId,
      order: index,
      title: `Section ${index + 1}`,
      ...overrides,
    })
  );
}

/**
 * Creates multiple test steps at once
 * @param count Number of steps to create
 * @param sectionId Section ID to associate steps with
 * @param overrides Common overrides for all steps
 */
export function createTestSteps(
  count: number,
  sectionId: string,
  overrides?: DeepPartial<Step>
): Array<Omit<Step, 'id' | 'createdAt' | 'updatedAt'>> {
  return Array.from({ length: count }, (_, index) =>
    createTestStep({
      sectionId,
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
      case 'short_text':
      case 'long_text':
        values[step.id] = `Sample text for ${step.id}`;
        break;
      case 'email':
        values[step.id] = generateEmail();
        break;
      case 'phone':
        values[step.id] = generatePhoneNumber();
        break;
      case 'number':
      case 'currency':
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
