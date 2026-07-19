import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Job } from 'bull';

import { db } from '../../../server/db';
import { processRevisionJob } from '../../../server/queues/AiRevisionQueue';
import { workflows, projects, users, tenants, sections, steps, logicRules } from '../../../shared/schema';

const { mockUserId, mockTenantId, mockGenerateContent } = vi.hoisted(() => ({
  mockUserId: crypto.randomUUID(),
  mockTenantId: crypto.randomUUID(),
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class {
      constructor(_apiKey?: string) { }
      getGenerativeModel() {
        return { generateContent: mockGenerateContent };
      }
    },
    Schema: {},
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      NUMBER: 'NUMBER',
      BOOLEAN: 'BOOLEAN',
      ARRAY: 'ARRAY',
    },
  };
});

describe('AiRevisionQueue Integration Tests', () => {
  let projectId: string;
  let workflowId: string;

  beforeAll(async () => {
    // The Gemini SDK is mocked above; the service only needs the key to exist.
    process.env.GEMINI_API_KEY ??= "test-key";

    // Basic setup for DB
    const [tenant] = await db.insert(tenants).values({
      id: mockTenantId,
      name: 'AI Queue Test Tenant',
    }).returning();

    const [user] = await db.insert(users).values({
      id: mockUserId,
      email: `ai-queue-test-${Date.now()}@example.com`,
      fullName: 'AI Queue Tester',
      tenantId: tenant.id,
    }).returning();

    const [project] = await db.insert(projects).values({
      title: 'AI Queue Project',
      name: 'AI Queue Project',
      tenantId: tenant.id,
      creatorId: user.id,
      createdBy: user.id,
      ownerId: user.id,
    }).returning();

    projectId = project.id;
  });

  beforeEach(async () => {
    mockGenerateContent.mockReset();

    const [workflow] = await db.insert(workflows).values({
      title: 'Base Workflow',
      projectId,
      creatorId: mockUserId,
      ownerId: mockUserId,
      status: 'draft',
    }).returning();
    workflowId = workflow.id;
  });

  afterAll(async () => {
    await db.delete(workflows).where(eq(workflows.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(users).where(eq(users.id, mockUserId));
    await db.delete(tenants).where(eq(tenants.id, mockTenantId));
  });

  it('persists step config with options and section-targeted rules', async () => {
    // Mock the AI model response — must satisfy AIWorkflowRevisionResponseSchema
    // ({ updatedWorkflow, diff }), which is what WorkflowRevisionService parses.
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          updatedWorkflow: {
            title: "Base Workflow",
            sections: [
              {
                id: "sec-1",
                title: "Test Section",
                description: "A section description",
                order: 0,
                steps: [
                  {
                    id: "step-1",
                    title: "Choose an option",
                    type: "multiple_choice",
                    description: "Select one",
                    alias: "choose_option",
                    required: false,
                    order: 0,
                    visibleIf: null,
                    config: {
                      options: [
                        { id: "opt1", label: "Option 1" },
                        { id: "opt2", label: "Option 2" }
                      ]
                    }
                  }
                ]
              }
            ],
            logicRules: [
              {
                id: "rule-1",
                conditionStepAlias: "choose_option",
                operator: "equals",
                conditionValue: "opt1",
                targetType: "section",
                targetAlias: "Test Section",
                action: "show"
              }
            ],
            transformBlocks: []
          },
          diff: {
            changes: [
              { type: "add", target: "sections[0]", explanation: "Added Test Section" }
            ]
          }
        })
      }
    });

    const mockJob = {
      id: "job-1",
      data: {
        workflowId,
        userId: mockUserId,
        currentWorkflow: { title: "Base Workflow", sections: [], logicRules: [], transformBlocks: [] },
        userInstruction: "Make a multiple choice step",
        mode: "easy",
      },
      progress: vi.fn(),
    } as unknown as Job<any>;

    const result = await processRevisionJob(mockJob);

    expect(result.success).toBe(true);
    expect(mockGenerateContent).toHaveBeenCalled();

    // Verify DB
    const sectionRows = await db.select().from(sections).where(eq(sections.workflowId, workflowId));
    expect(sectionRows).toHaveLength(1);
    expect(sectionRows[0].title).toBe("Test Section");

    const stepRows = await db.select().from(steps).where(eq(steps.sectionId, sectionRows[0].id));
    expect(stepRows).toHaveLength(1);
    expect(stepRows[0].type).toBe("multiple_choice");
    expect(stepRows[0].config).toMatchObject({
      options: [
        { id: "opt1", label: "Option 1" },
        { id: "opt2", label: "Option 2" }
      ]
    });

    const ruleRows = await db.select().from(logicRules).where(eq(logicRules.workflowId, workflowId));
    expect(ruleRows).toHaveLength(1);
    expect(ruleRows[0].targetType).toBe("section");
    expect(ruleRows[0].targetSectionId).toBe(sectionRows[0].id);
  });

  it('warns and drops invalid config but completes job', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          updatedWorkflow: {
            title: "Base Workflow",
            sections: [
              {
                id: "sec-1",
                title: "Invalid Config Section",
                order: 0,
                steps: [
                  {
                    id: "step-bad",
                    title: "Bad Step",
                    type: "multiple_choice",
                    required: false,
                    order: 0,
                    visibleIf: null,
                    config: {
                      // Invalid per the strict multiple_choice schema (options must be an array)
                      options: "this should be an array"
                    }
                  }
                ]
              }
            ],
            logicRules: [],
            transformBlocks: []
          },
          diff: { changes: [] }
        })
      }
    });

    const mockJob = {
      id: "job-2",
      data: {
        workflowId,
        userId: mockUserId,
        currentWorkflow: { title: "Base Workflow", sections: [], logicRules: [], transformBlocks: [] },
        userInstruction: "Make a bad step",
        mode: "easy",
      },
      progress: vi.fn(),
    } as unknown as Job<any>;

    const result = await processRevisionJob(mockJob);

    expect(result.success).toBe(true);

    const sectionRows = await db.select().from(sections).where(eq(sections.workflowId, workflowId));
    expect(sectionRows).toHaveLength(1);

    const stepRows = await db.select().from(steps).where(eq(steps.sectionId, sectionRows[0].id));
    expect(stepRows).toHaveLength(1);
    // Config should be null because validation failed
    expect(stepRows[0].config).toBeNull();
  });
});
