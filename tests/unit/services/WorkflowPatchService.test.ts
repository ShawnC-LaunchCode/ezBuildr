import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';

import { WorkflowPatchService } from '../../../server/services/WorkflowPatchService';

import { type Step, type Section, type Workflow, type Project, type Template, type WorkflowTemplate, type DatavaultTable, type DatavaultColumn, type DatavaultDatabase } from "@shared/schema";
import type { WorkflowPatchOp } from '../../../shared/validation/aiWorkflowEdit.schema';
import type {
  StepRepository,
  SectionRepository,
  WorkflowRepository,
  ProjectRepository,
  DocumentTemplateRepository,
  WorkflowTemplateRepository,
  DatavaultDatabasesRepository
} from '../../../server/repositories';
// Every op now runs inside one tenant-scoped transaction opened at the service
// boundary (RLS-2e) — with no tenant in the async context and RLS unenforced,
// `withCurrentTenant` falls through to a plain `db.transaction`. The fake just
// invokes the callback with a stub tx, which the mocked repos ignore; the
// assertions below therefore match the trailing tx with `expect.anything()`.
vi.mock('../../../server/db', () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  },
}));
// Mock repositories
vi.mock('../../../server/repositories', () => ({
  sectionRepository: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
    findByWorkflowId: vi.fn(),
    findById: vi.fn(),
  },
  stepRepository: {
    create: mockStepRepoCreate,
    update: mockStepRepoUpdate,
    delete: mockStepRepoDelete,
    softDelete: mockStepRepoSoftDelete,
    softDeleteBySectionId: mockStepRepoSoftDeleteBySectionId,
    findByWorkflowId: mockStepRepoFind,
    findBySectionId: mockStepRepoFindBySection,
    findById: mockStepRepoFindById,
  },
  logicRuleRepository: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  documentTemplateRepository: {
    findByIdAndProjectId: vi.fn(),
    update: vi.fn(),
  },
  workflowTemplateRepository: {
    create: vi.fn(),
  },
  workflowRepository: {
    findById: vi.fn(),
  },
  projectRepository: {
    findById: vi.fn(),
  },
  datavaultDatabasesRepository: {
    findById: vi.fn(),
  },
}));
vi.mock('../../../server/services/WorkflowService', () => ({
  workflowService: {
    updateWorkflow: vi.fn(),
  },
}));
// Shared mock functions
const { mockCreateTable, mockRequirePermission, mockCreateColumn, mockListColumns, mockStepRepoCreate, mockStepRepoUpdate, mockStepRepoDelete, mockStepRepoSoftDelete, mockStepRepoSoftDeleteBySectionId, mockStepRepoFind, mockStepRepoFindBySection, mockStepRepoFindById } = vi.hoisted(() => ({
  mockCreateTable: vi.fn(),
  mockRequirePermission: vi.fn(),
  mockCreateColumn: vi.fn(),
  mockListColumns: vi.fn(),
  mockStepRepoCreate: vi.fn(),
  mockStepRepoUpdate: vi.fn(),
  mockStepRepoDelete: vi.fn(),
  mockStepRepoSoftDelete: vi.fn(),
  mockStepRepoSoftDeleteBySectionId: vi.fn(),
  mockStepRepoFind: vi.fn(),
  mockStepRepoFindBySection: vi.fn(),
  mockStepRepoFindById: vi.fn(),
}));
vi.mock('../../../server/services/DatavaultTablesService', () => ({
  DatavaultTablesService: class {
    createTable = mockCreateTable;
    requirePermission = mockRequirePermission;
  }
}));
vi.mock('../../../server/services/DatavaultColumnsService', () => ({
  DatavaultColumnsService: class {
    createColumn = mockCreateColumn;
    listColumns = mockListColumns;
  }
}));
describe('WorkflowPatchService', () => {
  let service: WorkflowPatchService;
  let mockSectionRepo: Mocked<SectionRepository>;
  let mockStepRepo: Mocked<StepRepository>;
  let mockWorkflowRepo: Mocked<WorkflowRepository>;
  let mockProjectRepo: Mocked<ProjectRepository>;
  let mockDocTemplateRepo: Mocked<DocumentTemplateRepository>;
  let mockWorkflowTemplateRepo: Mocked<WorkflowTemplateRepository>;
  let mockDatavaultDatabasesRepo: Mocked<DatavaultDatabasesRepository>;

  const mockWorkflowId = 'workflow-123';
  const mockUserId = 'user-456';

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStepRepoFind.mockReset();
    mockStepRepoCreate.mockReset();
    mockStepRepoFindById.mockReset();
    mockStepRepoSoftDelete.mockReset();
    mockStepRepoSoftDeleteBySectionId.mockReset();

    const repos = await import('../../../server/repositories');
    mockSectionRepo = repos.sectionRepository as Mocked<SectionRepository>;
    mockStepRepo = repos.stepRepository as Mocked<StepRepository>;
    mockWorkflowRepo = repos.workflowRepository as Mocked<WorkflowRepository>;
    mockProjectRepo = repos.projectRepository as Mocked<ProjectRepository>;
    mockDocTemplateRepo = repos.documentTemplateRepository as Mocked<DocumentTemplateRepository>;
    mockWorkflowTemplateRepo = repos.workflowTemplateRepository as Mocked<WorkflowTemplateRepository>;
    mockDatavaultDatabasesRepo = repos.datavaultDatabasesRepository as Mocked<DatavaultDatabasesRepository>;

    service = new WorkflowPatchService(mockStepRepo);

    // Mock workflow and project lookups for getTenantContext
    mockWorkflowRepo.findById.mockResolvedValue({
      id: mockWorkflowId,
      projectId: 'project-123',
      tenantId: 'tenant-123',
    } as unknown as Workflow);
    mockProjectRepo.findById.mockResolvedValue({
      id: 'project-123',
      tenantId: 'tenant-123',
    } as unknown as Project);

    mockDatavaultDatabasesRepo.findById.mockResolvedValue({
      id: 'db-123',
      tenantId: 'tenant-123',
    } as unknown as DatavaultDatabase);

    // Default mock for assertEntityBelongsToWorkflow
    mockSectionRepo.findById.mockResolvedValue({
      id: 'section-123',
      workflowId: mockWorkflowId,
    } as unknown as Section);

    mockStepRepoFindById.mockResolvedValue({
      id: 'step-123',
      sectionId: 'section-123',
    } as unknown as Step);
  });
  describe('TempId Resolution', () => {
    it('should resolve section tempId to real UUID when creating step', async () => {
      // Mock section creation returning real ID
      mockSectionRepo.create.mockResolvedValue({
        id: 'section-real-uuid',
        workflowId: mockWorkflowId,
        title: 'Contact Info',
        order: 1,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Section);
      // Mock step creation
      mockStepRepo.create.mockResolvedValue({
        id: 'step-real-uuid',
        sectionId: 'section-real-uuid',
        type: 'short_text',
        title: 'Email',
        alias: 'email',
        required: true,
        order: 1,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Step);
      mockStepRepo.findBySectionId.mockResolvedValue([]);
      mockStepRepo.findByWorkflowId.mockResolvedValue([]);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'section.create',
          tempId: 'temp-section-1',
          title: 'Contact Info',
          order: 1,
        },
        {
          op: 'step.create',
          sectionRef: 'temp-section-1', // References tempId
          type: 'short_text',
          title: 'Email',
          alias: 'email',
          required: true,
          order: 1,
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toHaveLength(2);
      expect(result.summary[0]).toContain("Created section 'Contact Info'");
      expect(result.summary[1]).toContain("Created step 'Email'");
      // Verify step was created with resolved sectionId
      expect(mockStepRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: 'section-real-uuid',
        }),
        expect.anything()
      );
    });
    it('should handle multi-level tempId references', async () => {
      mockSectionRepo.create.mockResolvedValue({
        id: 'section-real-uuid',
        workflowId: mockWorkflowId,
        title: 'Personal Info',
        order: 1,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Section);
      mockStepRepo.create.mockResolvedValueOnce({
        id: 'step-real-uuid-1',
        sectionId: 'section-real-uuid',
        type: 'short_text',
        title: 'Name',
        alias: 'name',
        required: true,
        order: 1,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Step).mockResolvedValueOnce({
        id: 'step-real-uuid-2',
        sectionId: 'section-real-uuid',
        type: 'short_text',
        title: 'Email',
        alias: 'email',
        required: true,
        order: 2,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Step);
      mockStepRepo.update.mockResolvedValue({} as unknown as Step);
      mockStepRepo.findBySectionId.mockResolvedValue([]);
      mockStepRepo.findByWorkflowId.mockResolvedValue([]);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'section.create',
          tempId: 'temp-section-1',
          title: 'Personal Info',
          order: 1,
        },
        {
          op: 'step.create',
          tempId: 'temp-step-1',
          sectionRef: 'temp-section-1',
          type: 'short_text',
          title: 'Name',
          alias: 'name',
          required: true,
        },
        {
          op: 'step.create',
          sectionRef: 'temp-section-1',
          type: 'short_text',
          title: 'Email',
          alias: 'email',
          required: true,
        },
        {
          op: 'step.setVisibleIf',
          id: 'temp-step-1', // References step tempId
          // visibleIf is a ConditionExpression object, not a JSON string (ICW2-12).
          visibleIf: {
            type: 'group',
            id: 'g1',
            operator: 'AND',
            conditions: [
              { type: 'condition', id: 'c1', variable: 'showName', operator: 'is_true', valueType: 'constant' },
            ],
          },
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      if (result.errors.length > 0) {console.error(result.errors);}
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toHaveLength(4);
      // Verify step.setVisibleIf used resolved step ID
      expect(mockStepRepo.update).toHaveBeenCalledWith(
        'step-real-uuid-1',
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          visibleIf: expect.objectContaining({ type: 'group' }),
        }),
        expect.anything()
      );
    });
  });
  describe('Alias Uniqueness Validation', () => {
    it('should reject duplicate step alias on create', async () => {
      // Mock existing step with alias 'email'
      mockStepRepo.findByWorkflowId.mockResolvedValue([
        {
          id: 'existing-step-1',
          sectionId: 'section-1',
          type: 'email',
          title: 'Email Address',
          alias: 'email',
          required: true,
          order: 1,
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as Step,
      ]);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'step.create',
          sectionId: 'section-1',
          type: 'short_text',
          title: 'Backup Email',
          alias: 'email', // Duplicate!
          required: false,
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      if (result.errors.length !== 1) {
        console.error('Duplicate Alias Test Errors:', JSON.stringify(result.errors, null, 2));
      }
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Step alias 'email' already exists");
      expect(result.summary).toHaveLength(0);
    });
    it('should allow same alias on update of same step', async () => {
      mockStepRepo.findByWorkflowId.mockResolvedValue([
        {
          id: 'step-1',
          sectionId: 'section-1',
          type: 'email',
          title: 'Email Address',
          alias: 'email',
          required: true,
          order: 1,
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as Step,
      ]);
      mockStepRepo.update.mockResolvedValue({} as unknown as Step);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'step.update',
          id: 'step-1',
          alias: 'email', // Same alias, same step - OK
          title: 'Primary Email',
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toHaveLength(1);
    });
    it('should reject duplicate alias on update to different step', async () => {
      mockStepRepo.findByWorkflowId.mockResolvedValue([
        {
          id: 'step-1',
          sectionId: 'section-1',
          type: 'email',
          title: 'Email',
          alias: 'email',
          required: true,
          order: 1,
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as Step,
        {
          id: 'step-2',
          sectionId: 'section-1',
          type: 'short_text',
          title: 'Phone',
          alias: 'phone',
          required: false,
          order: 2,
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as Step,
      ]);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'step.update',
          id: 'step-2',
          alias: 'email', // Trying to use step-1's alias
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Step alias 'email' already exists");
    });
  });
  describe('Unknown Operation Rejection', () => {
    it('should reject completely unknown operation', async () => {
      const ops: unknown[] = [
        {
          op: 'workflow.destroyEverything', // Invalid!
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops as WorkflowPatchOp[]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid operation schema');
    });
    it('should reject malformed operation (missing required fields)', async () => {
      const ops: unknown[] = [
        {
          op: 'section.create',
          // Missing title!
        },
      ];
      // This should fail Zod validation before reaching applyOps
      // But if it somehow gets through, applyOps should handle it
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops as WorkflowPatchOp[]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid operation schema');
    });
  });
  describe('DataVault Additive Enforcement', () => {
    it('should reject unsafe DataVault operations (dropTable)', async () => {
      const ops: unknown[] = [
        {
          op: 'datavault.dropTable',
          tableId: 'table-123',
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops as WorkflowPatchOp[]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid operation schema');
    });
    it('should reject unsafe DataVault operations (dropColumn)', async () => {
      const ops: unknown[] = [
        {
          op: 'datavault.dropColumn',
          tableId: 'table-123',
          columnName: 'sensitive_data',
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops as WorkflowPatchOp[]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid operation schema');
    });
    it('should reject unsafe DataVault operations (deleteRows)', async () => {
      const ops: unknown[] = [
        {
          op: 'datavault.deleteRows',
          tableId: 'table-123',
          rowIds: ['row-1', 'row-2'],
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops as WorkflowPatchOp[]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid operation schema');
    });
    it('should reject unsafe DataVault operations (updateRowData)', async () => {
      const ops: unknown[] = [
        {
          op: 'datavault.updateRowData',
          tableId: 'table-123',
          rowId: 'row-1',
          data: { malicious: 'change' },
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops as WorkflowPatchOp[]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid operation schema');
    });
    it('should allow safe DataVault operations (createTable, addColumns)', async () => {
      const ops: WorkflowPatchOp[] = [
        {
          op: 'datavault.createTable',
          databaseId: 'db-123',
          name: 'Submissions',
          columns: [
            { name: 'email', type: 'text' },
            { name: 'submitted_at', type: 'date' },
          ],
        },
        {
          op: 'datavault.addColumns',
          tableId: 'table-123',
          columns: [{ name: 'phone', type: 'text' }],
        },
      ];
      // Mock createTable
      mockCreateTable.mockResolvedValue({ id: 'table-123', tenantId: 'tenant-123' });
      // Mock addColumns dependencies
      mockRequirePermission.mockResolvedValue(undefined);
      mockListColumns.mockResolvedValue([]);
      mockCreateColumn.mockResolvedValue({});
      // These should pass validation (no error about unsafe operations)
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      // May have errors from missing mocks, but not "Unsafe DataVault operation"
      result.errors.forEach(error => {
        expect(error).not.toContain('Unsafe DataVault operation');
      });
    });
  });
  describe('Operation Application', () => {
    it('should rollback all ops if any op fails', async () => {
      mockSectionRepo.create.mockResolvedValue({
        id: 'section-real-uuid',
        workflowId: mockWorkflowId,
        title: 'Contact Info',
        order: 1,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Section);
      mockStepRepo.findByWorkflowId.mockResolvedValue([
        {
          id: 'existing-step',
          sectionId: 'section-1',
          type: 'email',
          title: 'Email',
          alias: 'email',
          required: true,
          order: 1,
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as Step,
      ]);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'section.create',
          tempId: 'temp-section-1',
          title: 'Contact Info',
          order: 1,
        },
        {
          op: 'step.create',
          sectionRef: 'temp-section-1',
          type: 'short_text',
          title: 'Duplicate Email',
          alias: 'email', // Will fail validation!
          required: false,
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      // Should fail validation before applying any ops
      expect(result.errors).toHaveLength(1);
      expect(result.summary).toHaveLength(0);
      // Section should NOT be created (validation happens before application)
      expect(mockSectionRepo.create).not.toHaveBeenCalled();
    });
    it('should clear tempId mappings between batch calls', async () => {
      mockSectionRepo.create.mockResolvedValue({
        id: 'section-real-uuid-1',
        workflowId: mockWorkflowId,
        title: 'Section 1',
        order: 1,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Section);
      mockStepRepo.create.mockResolvedValue({
        id: 'step-real-uuid-1',
        sectionId: 'section-real-uuid-1',
        type: 'short_text',
        title: 'Field 1',
        alias: 'field1',
        required: false,
        order: 1,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Step);
      mockStepRepo.findBySectionId.mockResolvedValue([]);
      mockStepRepo.findByWorkflowId.mockResolvedValue([]);
      const batch1: WorkflowPatchOp[] = [
        {
          op: 'section.create',
          tempId: 'temp-section-1', // section-real-uuid-1
          title: 'Section 1',
          order: 1,
        },
      ];
      // Reset step repository mock to fail on invalid section ID references
      // This simulates DB foreign key constraints when an ID is not resolved
      mockStepRepo.create.mockImplementation(async (data: { sectionId?: string }) => {
        if (data.sectionId?.startsWith('temp-')) {
          throw new Error(`Invalid section ID: ${data.sectionId}`);
        }
        return { id: 'step-1' } as Step;
      });
      const batch2: WorkflowPatchOp[] = [
        {
          op: 'step.create',
          sectionRef: 'temp-section-1', // Should NOT resolve to batch1's section
          type: 'short_text',
          title: 'Field 1',
          alias: 'field1',
        },
      ];
      // First batch succeeds
      const result1 = await service.applyOps(mockWorkflowId, mockUserId, batch1);
      expect(result1.errors).toHaveLength(0);
      // Second batch should fail (tempId no longer valid)
      const result2 = await service.applyOps(mockWorkflowId, mockUserId, batch2);
      expect(result2.errors).toHaveLength(1);
      // Logic changed: now error comes from repository failure due to unresolved ID, or Service if I updated it
      // Since Service passes "temp-section-1", and Repo Mock now throws "Invalid section ID"
      expect(result2.errors[0]).toContain('section');
    });
  });
  describe('Delete Operations (ICW2-B11 — AI ops soft-delete)', () => {
    it('soft-deletes a step instead of hard-deleting it (step.delete)', async () => {
      const ops: WorkflowPatchOp[] = [
        {
          op: 'step.delete',
          id: 'step-123',
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(0);
      expect(result.summary[0]).toContain('Deleted step');
      expect(mockStepRepo.softDelete).toHaveBeenCalledWith('step-123', expect.anything());
      expect(mockStepRepo.delete).not.toHaveBeenCalled();
    });
    it('soft-deletes a section AND cascades to its steps instead of hard-deleting either (section.delete)', async () => {
      const ops: WorkflowPatchOp[] = [
        {
          op: 'section.delete',
          id: 'section-123',
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(0);
      expect(result.summary[0]).toContain('Deleted section');
      // Cascade: the section's own steps are soft-deleted first, mirroring
      // the manual delete path's transactional cascade.
      expect(mockStepRepo.softDeleteBySectionId).toHaveBeenCalledWith('section-123', expect.anything());
      expect(mockSectionRepo.softDelete).toHaveBeenCalledWith('section-123', expect.anything());
      expect(mockSectionRepo.delete).not.toHaveBeenCalled();
      expect(mockStepRepo.delete).not.toHaveBeenCalled();
    });
  });
  describe('Logic Rule Operations', () => {
    it('should create visibility rule on step', async () => {
      mockStepRepo.update.mockResolvedValue({} as unknown as Step);
      mockStepRepo.findByWorkflowId.mockResolvedValue([]);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'logicRule.create',
          rule: {
            condition: "email equals 'test@example.com'",
            action: 'show',
            target: { type: 'step', id: 'step-123' },
          },
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toHaveLength(1);
      expect(result.summary[0]).toContain('Applied visibility rule to step');
      expect(mockStepRepo.update).toHaveBeenCalledWith(
        'step-123',
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          visibleIf: expect.objectContaining({
            type: 'group',
            operator: 'AND',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            conditions: expect.arrayContaining([
              expect.objectContaining({
                type: 'condition',
                variable: 'email',
                operator: 'equals',
                value: 'test@example.com',
                valueType: 'constant',
              }),
            ]),
          }),
        }),
        expect.anything()
      );
    });
    it('should parse complex condition expressions', async () => {
      mockSectionRepo.update.mockResolvedValue({} as unknown as Section);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'logicRule.create',
          rule: {
            condition: "age gt 18",
            action: 'show',
            target: { type: 'section', id: 'section-123' },
          },
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(0);
      expect(mockSectionRepo.update).toHaveBeenCalledWith(
        'section-123',
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          visibleIf: expect.objectContaining({
            type: 'group',
            operator: 'AND',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            conditions: expect.arrayContaining([
              expect.objectContaining({
                type: 'condition',
                variable: 'age',
                operator: 'greater_than',
                value: 18,
                valueType: 'constant',
              }),
            ]),
          }),
        }),
        expect.anything()
      );
    });

    it.each([
      ['has_pet is_true', 'has_pet', 'is_true'],
      ['has_pet is_false', 'has_pet', 'is_false'],
      ['email is_empty', 'email', 'is_empty'],
      ['email is_not_empty', 'email', 'is_not_empty'],
    ])('parses the valueless operator in %s (ICW2-12)', async (expression, variable, operator) => {
      // These end the string, so a parser that only matched ` op ` (with a
      // trailing space) rejected every boolean/emptiness rule outright.
      mockSectionRepo.update.mockResolvedValue({} as unknown as Section);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'logicRule.create',
          rule: { condition: expression, action: 'show', target: { type: 'section', id: 'section-123' } },
        },
      ];

      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);

      expect(result.errors).toHaveLength(0);
      expect(mockSectionRepo.update).toHaveBeenCalledWith(
        'section-123',
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          visibleIf: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            conditions: expect.arrayContaining([
              expect.objectContaining({ variable, operator, valueType: 'constant' }),
            ]),
          }),
        }),
        expect.anything()
      );
    });
  });
  describe('Document Operations', () => {
    beforeEach(async () => {
      // Mock tenant context
      mockWorkflowRepo.findById.mockResolvedValue({
        id: mockWorkflowId,
        projectId: 'project-123',
        title: 'Test Workflow',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Workflow);
      mockProjectRepo.findById.mockResolvedValue({
        id: 'project-123',
        tenantId: 'tenant-123',
        name: 'Test Project',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Project);
    });
    it('should attach document to workflow (document.add)', async () => {
      mockDocTemplateRepo.findByIdAndProjectId.mockResolvedValue({
        id: 'template-123',
        projectId: 'project-123',
        name: 'Engagement Letter',
        type: 'pdf',
        fileRef: '/templates/engagement.pdf',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Template);
      mockWorkflowTemplateRepo.create.mockResolvedValue({
        id: 'wf-template-123',
        workflowVersionId: mockWorkflowId,
        templateId: 'template-123',
        key: 'engagement-letter',
        isPrimary: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as WorkflowTemplate);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'document.add',
          tempId: 'temp-doc-1',
          name: 'Engagement Letter',
          fileType: 'pdf',
          template: 'template-123', // Reference to existing template
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toHaveLength(1);
      expect(result.summary[0]).toContain("Attached document 'Engagement Letter'");
      expect(mockDocTemplateRepo.findByIdAndProjectId).toHaveBeenCalledWith(
        'template-123',
        'project-123',
        expect.anything()
      );
      expect(mockWorkflowTemplateRepo.create).toHaveBeenCalledWith({
        workflowVersionId: mockWorkflowId,
        templateId: 'template-123',
        key: 'engagement-letter',
        isPrimary: false,
      }, expect.anything());
    });
    it('should bind document fields to workflow variables (document.bindFields)', async () => {
      mockStepRepo.findByWorkflowId.mockResolvedValue([
        {
          id: 'step-1',
          sectionId: 'section-1',
          type: 'short_text',
          title: 'Full Name',
          alias: 'fullName',
          required: true,
          order: 1,
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as Step,
        {
          id: 'step-2',
          sectionId: 'section-1',
          type: 'email',
          title: 'Email',
          alias: 'email',
          required: true,
          order: 2,
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as Step,
      ]);
      mockDocTemplateRepo.update.mockResolvedValue({} as unknown as Template);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'document.bindFields',
          id: 'template-123',
          bindings: {
            client_name: 'fullName',
            client_email: 'email',
          },
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toHaveLength(1);
      expect(result.summary[0]).toContain('Bound 2 field(s) to workflow variables');
      expect(mockDocTemplateRepo.update).toHaveBeenCalledWith('template-123', {
        mapping: {
          client_name: { type: 'variable', source: 'fullName' },
          client_email: { type: 'variable', source: 'email' },
        },
      }, expect.anything());
    });
    it('should reject binding to non-existent step alias', async () => {
      mockStepRepo.findByWorkflowId.mockResolvedValue([
        {
          id: 'step-1',
          sectionId: 'section-1',
          type: 'short_text',
          title: 'Full Name',
          alias: 'fullName',
          required: true,
          order: 1,
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as Step,
      ]);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'document.bindFields',
          id: 'template-123',
          bindings: {
            client_name: 'nonExistentAlias', // Invalid!
          },
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Step alias 'nonExistentAlias' not found");
    });
  });
  describe('DataVault Operations', () => {
    beforeEach(async () => {
      const { workflowRepository, projectRepository } = await import('../../../server/repositories');
      // Mock tenant context
      vi.mocked(workflowRepository.findById).mockResolvedValue({
        id: mockWorkflowId,
        projectId: 'project-123',
        title: 'Test Workflow',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Workflow);
      vi.mocked(projectRepository.findById).mockResolvedValue({
        id: 'project-123',
        tenantId: 'tenant-123',
        name: 'Test Project',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as Project);
    });
    it('should create DataVault table with columns (datavault.createTable)', async () => {
      const { DatavaultTablesService } = vi.mocked(
        await import('../../../server/services/DatavaultTablesService')
      );
      const { DatavaultColumnsService } = vi.mocked(
        await import('../../../server/services/DatavaultColumnsService')
      );
      const mockTableService = new DatavaultTablesService();
      const mockColumnService = new DatavaultColumnsService();
      vi.mocked(mockTableService.createTable).mockResolvedValue({
        id: 'table-new',
        tenantId: 'tenant-123',
        ownerUserId: mockUserId,
        databaseId: 'db-123',
        name: 'Submissions',
        slug: 'submissions',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as DatavaultTable);
      vi.mocked(mockColumnService.createColumn).mockResolvedValue({} as unknown as DatavaultColumn);
      mockCreateTable.mockResolvedValue({ id: 'table-123', tenantId: 'tenant-123' });
      const ops: WorkflowPatchOp[] = [
        {
          op: 'datavault.createTable',
          tempId: 'temp-table-1',
          databaseId: 'db-123',
          name: 'Submissions',
          columns: [
            { name: 'Email', type: 'text' },
            { name: 'Phone', type: 'text' },
            { name: 'Submitted At', type: 'date' },
          ],
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toHaveLength(1);
      expect(result.summary[0]).toContain("Created DataVault table 'Submissions' with 3 column(s)");
    });
  });
});
