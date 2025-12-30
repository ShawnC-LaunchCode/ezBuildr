import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { db } from '../../../server/db';
import { workflows, workflowVersions, projects, users, sections, steps } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { registerAiWorkflowEditRoutes } from '../../../server/routes/ai/workflowEdit.routes';

// Mock authentication middleware
vi.mock('../../../server/middleware/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.userId = 'test-user-id';
    next();
  },
}));

// Mock Gemini API
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            operations: [
              {
                op: 'section.create',
                tempId: 'temp-section-1',
                title: 'Contact Information',
                order: 1,
              },
              {
                op: 'step.create',
                sectionRef: 'temp-section-1',
                type: 'email',
                title: 'Email Address',
                alias: 'email',
                required: true,
              },
            ],
            summary: ['Created Contact Information section', 'Added Email Address field'],
            warnings: [],
            questions: [],
            confidence: 0.95,
          }),
        },
      }),
    }),
  })),
}));

describe('POST /api/workflows/:workflowId/ai/edit - Integration Test', () => {
  let app: express.Application;
  let testUserId: string;
  let testProjectId: string;
  let testWorkflowId: string;

  beforeAll(async () => {
    // Setup Express app
    app = express();
    app.use(express.json());
    registerAiWorkflowEditRoutes(app);

    // Create test user
    const [user] = await db.insert(users).values({
      email: 'test@example.com',
      name: 'Test User',
      tenantId: 'test-tenant',
    }).returning();
    testUserId = user.id;

    // Create test project
    const [project] = await db.insert(projects).values({
      name: 'Test Project',
      createdBy: testUserId,
      tenantId: 'test-tenant',
    }).returning();
    testProjectId = project.id;
  });

  beforeEach(async () => {
    // Create fresh workflow for each test
    const [workflow] = await db.insert(workflows).values({
      title: 'Test Workflow',
      projectId: testProjectId,
      status: 'active', // Start as active to test draft enforcement
      createdBy: testUserId,
      graphJson: { sections: [], steps: [] },
    }).returning();
    testWorkflowId = workflow.id;
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(steps).where(eq(steps.workflowId, testWorkflowId));
    await db.delete(sections).where(eq(sections.workflowId, testWorkflowId));
    await db.delete(workflowVersions).where(eq(workflowVersions.workflowId, testWorkflowId));
    await db.delete(workflows).where(eq(workflows.id, testWorkflowId));
    await db.delete(projects).where(eq(projects.id, testProjectId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('should create draft version on successful AI edit', async () => {
    const response = await request(app)
      .post(`/api/workflows/${testWorkflowId}/ai/edit`)
      .send({
        userMessage: 'Add a contact information section with an email field',
        preferences: {
          readingLevel: 'standard',
          tone: 'neutral',
          interviewerRole: 'workflow designer',
          dropdownThreshold: 5,
        },
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.versionId).toBeDefined();
    expect(response.body.data.summary).toHaveLength(2);
    expect(response.body.data.noChanges).toBe(false);

    // Verify version was created in database
    const [version] = await db.select()
      .from(workflowVersions)
      .where(eq(workflowVersions.id, response.body.data.versionId))
      .limit(1);

    expect(version).toBeDefined();
    expect(version.isDraft).toBe(true);
    expect(version.published).toBe(false);
    expect(version.migrationInfo).toBeDefined();

    const aiMetadata = (version.migrationInfo as any)?.aiMetadata;
    expect(aiMetadata).toBeDefined();
    expect(aiMetadata.aiGenerated).toBe(true);
    expect(aiMetadata.userPrompt).toBe('Add a contact information section with an email field');
    expect(aiMetadata.confidence).toBe(0.95);
    expect(aiMetadata.beforeSnapshotId).toBeDefined();
    expect(aiMetadata.afterSnapshotId).toBeDefined();
  });

  it('should enforce draft mode (revert active workflow to draft)', async () => {
    // Verify workflow starts as active
    const [workflowBefore] = await db.select()
      .from(workflows)
      .where(eq(workflows.id, testWorkflowId))
      .limit(1);
    expect(workflowBefore.status).toBe('active');

    await request(app)
      .post(`/api/workflows/${testWorkflowId}/ai/edit`)
      .send({
        userMessage: 'Add a phone number field',
      })
      .expect(200);

    // Verify workflow is now draft
    const [workflowAfter] = await db.select()
      .from(workflows)
      .where(eq(workflows.id, testWorkflowId))
      .limit(1);
    expect(workflowAfter.status).toBe('draft');
  });

  it('should not create version when no changes detected (checksum match)', async () => {
    // First edit
    const response1 = await request(app)
      .post(`/api/workflows/${testWorkflowId}/ai/edit`)
      .send({
        userMessage: 'Add contact section',
      })
      .expect(200);

    const versionId1 = response1.body.data.versionId;
    expect(versionId1).toBeDefined();

    // Mock Gemini to return no operations (no changes)
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    vi.mocked(GoogleGenerativeAI).mockImplementationOnce(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              operations: [], // No operations
              summary: [],
              warnings: [],
              questions: [],
              confidence: 1.0,
            }),
          },
        }),
      }),
    }) as any);

    // Second edit with no actual changes
    const response2 = await request(app)
      .post(`/api/workflows/${testWorkflowId}/ai/edit`)
      .send({
        userMessage: 'No changes needed',
      })
      .expect(200);

    expect(response2.body.data.versionId).toBeNull();
    expect(response2.body.data.noChanges).toBe(true);
  });

  it('should reject unauthorized access', async () => {
    // Mock auth to fail
    vi.doMock('../../../server/middleware/auth', () => ({
      requireAuth: (req: any, res: any, next: any) => {
        res.status(401).json({ error: 'Unauthorized' });
      },
    }));

    await request(app)
      .post(`/api/workflows/${testWorkflowId}/ai/edit`)
      .send({
        userMessage: 'Add field',
      })
      .expect(401);
  });

  it('should reject unsafe DataVault operations', async () => {
    // Mock Gemini to return unsafe operation
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    vi.mocked(GoogleGenerativeAI).mockImplementationOnce(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              operations: [
                {
                  op: 'datavault.dropTable',
                  tableId: 'table-123',
                },
              ],
              summary: [],
              warnings: [],
              questions: [],
              confidence: 0.9,
            }),
          },
        }),
      }),
    }) as any);

    const response = await request(app)
      .post(`/api/workflows/${testWorkflowId}/ai/edit`)
      .send({
        userMessage: 'Delete all data',
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Unsafe DataVault operation');
  });

  it('should handle multi-operation edits with tempId resolution', async () => {
    // Mock Gemini to return multi-op edit
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    vi.mocked(GoogleGenerativeAI).mockImplementationOnce(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              operations: [
                {
                  op: 'section.create',
                  tempId: 'temp-section-emergency',
                  title: 'Emergency Contact',
                  order: 2,
                },
                {
                  op: 'step.create',
                  tempId: 'temp-step-emergency-name',
                  sectionRef: 'temp-section-emergency',
                  type: 'short_text',
                  title: 'Emergency Contact Name',
                  alias: 'emergency_contact_name',
                  required: true,
                },
                {
                  op: 'step.create',
                  tempId: 'temp-step-emergency-phone',
                  sectionRef: 'temp-section-emergency',
                  type: 'phone',
                  title: 'Emergency Contact Phone',
                  alias: 'emergency_contact_phone',
                  required: true,
                },
                {
                  op: 'logicRule.create',
                  rule: {
                    condition: "has_emergency_contact equals true",
                    action: 'show',
                    target: { type: 'section', tempId: 'temp-section-emergency' },
                  },
                },
              ],
              summary: [
                'Created Emergency Contact section',
                'Added Emergency Contact Name field',
                'Added Emergency Contact Phone field',
                'Applied visibility rule to section',
              ],
              warnings: [],
              questions: [],
              confidence: 0.92,
            }),
          },
        }),
      }),
    }) as any);

    const response = await request(app)
      .post(`/api/workflows/${testWorkflowId}/ai/edit`)
      .send({
        userMessage: 'Add emergency contact section with name and phone, show only if has_emergency_contact is true',
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.summary).toHaveLength(4);
    expect(response.body.data.versionId).toBeDefined();

    // Verify all entities were created
    const createdSections = await db.select()
      .from(sections)
      .where(eq(sections.workflowId, testWorkflowId));
    expect(createdSections).toHaveLength(1);
    expect(createdSections[0].title).toBe('Emergency Contact');

    const createdSteps = await db.select()
      .from(steps)
      .where(eq(steps.sectionId, createdSections[0].id));
    expect(createdSteps).toHaveLength(2);
    expect(createdSteps.some(s => s.alias === 'emergency_contact_name')).toBe(true);
    expect(createdSteps.some(s => s.alias === 'emergency_contact_phone')).toBe(true);

    // Verify visibility rule was applied
    expect(createdSections[0].visibleIf).toBeDefined();
    expect((createdSections[0].visibleIf as any).op).toBe('equals');
  });

  it('should create BEFORE and AFTER snapshots', async () => {
    const response = await request(app)
      .post(`/api/workflows/${testWorkflowId}/ai/edit`)
      .send({
        userMessage: 'Add a simple field',
      })
      .expect(200);

    const versionId = response.body.data.versionId;
    const [version] = await db.select()
      .from(workflowVersions)
      .where(eq(workflowVersions.id, versionId))
      .limit(1);

    const aiMetadata = (version.migrationInfo as any)?.aiMetadata;
    expect(aiMetadata.beforeSnapshotId).toBeDefined();
    expect(aiMetadata.afterSnapshotId).toBeDefined();
    expect(aiMetadata.beforeSnapshotId).not.toBe(aiMetadata.afterSnapshotId);
  });

  it('should rollback on validation failure', async () => {
    // Mock Gemini to return invalid operation (duplicate alias)
    const { GoogleGenerativeAI } = await import('@google/generative-ai');

    // First, create a step with alias 'email'
    const [section] = await db.insert(sections).values({
      workflowId: testWorkflowId,
      title: 'Initial Section',
      order: 1,
      config: {},
    }).returning();

    await db.insert(steps).values({
      sectionId: section.id,
      workflowId: testWorkflowId,
      type: 'email',
      title: 'Email',
      alias: 'email',
      required: true,
      order: 1,
      config: {},
    });

    // Now try to create duplicate
    vi.mocked(GoogleGenerativeAI).mockImplementationOnce(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn().mockResolvedValue({
          response: {
            text: () => JSON.stringify({
              operations: [
                {
                  op: 'step.create',
                  sectionId: section.id,
                  type: 'short_text',
                  title: 'Backup Email',
                  alias: 'email', // Duplicate!
                  required: false,
                },
              ],
              summary: [],
              warnings: [],
              questions: [],
              confidence: 0.85,
            }),
          },
        }),
      }),
    }) as any);

    const response = await request(app)
      .post(`/api/workflows/${testWorkflowId}/ai/edit`)
      .send({
        userMessage: 'Add backup email field',
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain("Step alias 'email' already exists");

    // Verify no version was created
    expect(response.body.data?.versionId).toBeUndefined();

    // Verify workflow is still in valid state (only original step exists)
    const allSteps = await db.select()
      .from(steps)
      .where(eq(steps.workflowId, testWorkflowId));
    expect(allSteps).toHaveLength(1);
    expect(allSteps[0].title).toBe('Email');
  });
});
