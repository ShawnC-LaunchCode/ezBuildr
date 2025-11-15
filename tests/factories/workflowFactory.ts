/**
 * Test factory for creating workflow-related test data
 */

import type { Workflow, Section, Step, LogicRule, WorkflowRun } from "@shared/schema";

/**
 * Create a test workflow
 */
export function createTestWorkflow(overrides?: Partial<Workflow>): Workflow {
  const now = new Date();
  return {
    id: "workflow-" + Math.random().toString(36).substring(7),
    projectId: overrides?.projectId || "project-test-123",
    name: "Test Workflow",
    title: "Test Workflow",
    description: "A test workflow for unit testing",
    status: "draft",
    creatorId: "user-test-123",
    ownerId: "user-test-123",
    tenantId: "tenant-test-123",
    publicLink: null,
    easyModeEnabled: false,
    welcomeScreen: null,
    thankYouScreen: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a test section
 */
export function createTestSection(workflowId: string, overrides?: Partial<Section>): Section {
  const now = new Date();
  return {
    id: "section-" + Math.random().toString(36).substring(7),
    workflowId,
    title: "Test Section",
    description: null,
    order: 1,
    skipLogic: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a test step
 */
export function createTestStep(sectionId: string, overrides?: Partial<Step>): Step {
  const now = new Date();
  return {
    id: "step-" + Math.random().toString(36).substring(7),
    sectionId,
    type: "short_text",
    title: "Test Step",
    description: null,
    alias: null,
    required: false,
    order: 1,
    config: {},
    isVirtual: false,
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
    id: "logic-" + Math.random().toString(36).substring(7),
    workflowId,
    condition: {
      stepId: "step-123",
      operator: "equals",
      value: "yes",
    },
    action: {
      type: "show",
      targetStepId: "step-456",
    },
    enabled: true,
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
    id: "run-" + Math.random().toString(36).substring(7),
    workflowId,
    runToken: "token-" + Math.random().toString(36).substring(7),
    createdBy: "creator:user-test-123",
    completed: false,
    completedAt: null,
    currentSectionId: null,
    progress: 0,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Create a complete workflow with sections and steps
 */
export function createTestWorkflowWithDetails(overrides?: {
  workflow?: Partial<Workflow>;
  sections?: Partial<Section>[];
  steps?: Partial<Step>[];
  logicRules?: Partial<LogicRule>[];
}) {
  const workflow = createTestWorkflow(overrides?.workflow);

  const sections = (overrides?.sections || [{ title: "Section 1" }, { title: "Section 2" }]).map(
    (sectionData, index) => createTestSection(workflow.id, { order: index + 1, ...sectionData })
  );

  const steps = (overrides?.steps || [
    { title: "Step 1", type: "short_text" as const },
    { title: "Step 2", type: "long_text" as const },
  ]).map((stepData, index) =>
    createTestStep(sections[0].id, { order: index + 1, ...stepData })
  );

  const logicRules = (overrides?.logicRules || []).map((ruleData) =>
    createTestLogicRule(workflow.id, ruleData)
  );

  return {
    workflow,
    sections,
    steps,
    logicRules,
  };
}
