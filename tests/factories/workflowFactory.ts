/**
 * Test factory for creating workflow-related test data
 */

import type { Workflow, Page, Step, LogicRule, WorkflowRun } from "../../shared/schema";
import { buildTestWhen } from "../helpers/conditionFixtures";

/**
 * Create a test workflow
 */
export function createTestWorkflow(overrides?: Partial<Workflow>): Workflow {
  const now = new Date();
  return {
    id: `workflow-${  Math.random().toString(36).substring(7)}`,
    projectId: overrides?.projectId || "project-test-123",
    name: "Test Workflow",
    title: "Test Workflow",
    description: "A test workflow for unit testing",
    status: "draft",
    creatorId: "user-test-123",
    ownerId: "user-test-123",
    ownerType: null,
    ownerUuid: null,
    publicLink: null,
    isPublic: false,
    slug: null,
    requireLogin: false,
    intakeConfig: {},
    settings: {},
    pinnedVersionId: null,
    modeOverride: null,
    sourceBlueprintId: null,
    currentVersionId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a test page
 */
export function createTestPage(workflowId: string, overrides?: Partial<Page>): Page {
  const now = new Date();
  return {
    id: `page-${  Math.random().toString(36).substring(7)}`,
    workflowId,
    title: "Test Page",
    description: null,
    order: 1,
    sectionId: null,
    config: {},
    visibleIf: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a test step
 */
export function createTestStep(pageId: string, overrides?: Partial<Step>): Step {
  const now = new Date();
  return {
    id: `step-${  Math.random().toString(36).substring(7)}`,
    workflowId: overrides?.workflowId ?? "workflow-test-123",
    pageId,
    type: "short_text",
    title: "Test Step",
    description: null,
    alias: null,
    defaultValue: null,
    required: false,
    order: 1,
    config: {},
    visibleIf: null,
    isVirtual: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a test logic rule
 */
export function createTestLogicRule(workflowId: string, overrides?: Partial<LogicRule>): LogicRule {
  const now = new Date();
  return {
    id: `logic-${  Math.random().toString(36).substring(7)}`,
    workflowId,
    conditionStepId: "step-123",
    when: buildTestWhen("step-123", "equals", "yes"),
    targetType: "step",
    targetStepId: "step-456",
    targetPageId: null,
    action: "show",
    order: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a test workflow run
 */
export function createTestWorkflowRun(workflowId: string, overrides?: Partial<WorkflowRun>): WorkflowRun {
  const now = new Date();
  return {
    id: `run-${  Math.random().toString(36).substring(7)}`,
    workflowId,
    runToken: `token-${  Math.random().toString(36).substring(7)}`,
    tokenExpiresAt: null,
    createdBy: "creator:user-test-123",
    completed: false,
    completedAt: null,
    currentPageId: null,
    progress: 0,
    metadata: null,
    generationStatus: "pending",
    workflowVersionId: "v1", // Default to a dummy version
    clientEmail: null,
    assignedToUserId: null,
    assignmentUpdatedAt: null,
    portalAccessKey: null,
    accessMode: "anonymous",
    shareTokenHash: null,
    shareTokenExpiresAt: null,
    ownerType: null,
    ownerUuid: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a complete workflow with pages and steps
 */
export function createTestWorkflowWithDetails(overrides?: {
  workflow?: Partial<Workflow>;
  pages?: Partial<Page>[];
  steps?: Partial<Step>[];
  logicRules?: Partial<LogicRule>[];
}) {
  const workflow = createTestWorkflow(overrides?.workflow);

  const pages = (overrides?.pages || [{ title: "Page 1" }, { title: "Page 2" }]).map(
    (pageData, index) => createTestPage(workflow.id, { order: index + 1, ...pageData })
  );

  const steps = (overrides?.steps || [
    { title: "Step 1", type: "short_text" as const },
    { title: "Step 2", type: "long_text" as const },
  ]).map((stepData, index) =>
    createTestStep(pages[0].id, { workflowId: workflow.id, order: index + 1, ...stepData })
  );

  const logicRules = (overrides?.logicRules || []).map((ruleData) =>
    createTestLogicRule(workflow.id, ruleData)
  );

  return {
    workflow,
    pages,
    steps,
    logicRules,
  };
}
