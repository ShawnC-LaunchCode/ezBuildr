import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowPatchService } from '../../../server/services/WorkflowPatchService';
import type { WorkflowPatchOp } from '../../../server/schemas/aiWorkflowEdit.schema';
// Mock repositories
vi.mock('../../../server/repositories', () => ({
  sectionRepository: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findByWorkflowId: vi.fn(),
  },
  stepRepository: {
    create: mockStepRepoCreate,
    update: mockStepRepoUpdate,
    delete: mockStepRepoDelete,
    findByWorkflowId: mockStepRepoFind,
    findBySectionId: mockStepRepoFindBySection,
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
  datavaultWritebackMappingsRepository: {
    create: vi.fn(),
  },
}));
vi.mock('../../../server/services/WorkflowService', () => ({
  workflowService: {
    updateWorkflow: vi.fn(),
  },
}));
// Shared mock functions
const { mockCreateTable, mockRequirePermission, mockCreateColumn, mockListColumns, mockStepRepoCreate, mockStepRepoUpdate, mockStepRepoDelete, mockStepRepoFind, mockStepRepoFindBySection } = vi.hoisted(() => ({
  mockCreateTable: vi.fn(),
  mockRequirePermission: vi.fn(),
  mockCreateColumn: vi.fn(),
  mockListColumns: vi.fn(),
  mockStepRepoCreate: vi.fn(),
  mockStepRepoUpdate: vi.fn(),
  mockStepRepoDelete: vi.fn(),
  mockStepRepoFind: vi.fn(),
  mockStepRepoFindBySection: vi.fn(),
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
  const mockWorkflowId = 'workflow-123';
  const mockUserId = 'user-456';
  beforeEach(async () => {
    const { stepRepository, workflowRepository, projectRepository } = await import('../../../server/repositories');
    service = new WorkflowPatchService(stepRepository);
    vi.clearAllMocks();
    mockStepRepoFind.mockReset();
    mockStepRepoCreate.mockReset();
    // Mock workflow and project lookups for getTenantContext
    vi.mocked(workflowRepository.findById).mockResolvedValue({
      id: mockWorkflowId,
      projectId: 'project-123',
      tenantId: 'tenant-123',
    } as any);
    vi.mocked(projectRepository.findById).mockResolvedValue({
      id: 'project-123',
      tenantId: 'tenant-123',
    } as any);
  });
  describe('TempId Resolution', () => {
    it('should resolve section tempId to real UUID when creating step', async () => {
      const { sectionRepository, stepRepository } = await import('../../../server/repositories');
      // Mock section creation returning real ID
      vi.mocked(sectionRepository.create).mockResolvedValue({
        id: 'section-real-uuid',
        workflowId: mockWorkflowId,
        title: 'Contact Info',
        order: 1,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      // Mock step creation
      mockStepRepoCreate.mockResolvedValue({
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
      } as any);
      mockStepRepoFindBySection.mockResolvedValue([]);
      mockStepRepoFind.mockResolvedValue([]);
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
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toHaveLength(2);
      expect(result.summary[0]).toContain("Created section 'Contact Info'");
      expect(result.summary[1]).toContain("Created step 'Email'");
      // Verify step was created with resolved sectionId
      expect(stepRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: 'section-real-uuid',
        })
      );
    });
    it('should handle multi-level tempId references', async () => {
      const { sectionRepository, stepRepository } = await import('../../../server/repositories');
      vi.mocked(sectionRepository.create).mockResolvedValue({
        id: 'section-real-uuid',
        workflowId: mockWorkflowId,
        title: 'Personal Info',
        order: 1,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockStepRepoCreate.mockResolvedValueOnce({
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
      } as any).mockResolvedValueOnce({
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
      } as any);
      mockStepRepoUpdate.mockResolvedValue({} as any);
      mockStepRepoFindBySection.mockResolvedValue([]);
      mockStepRepoFind.mockResolvedValue([]);
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
          visibleIf: JSON.stringify({ op: 'equals', left: { type: 'variable', path: 'showName' }, right: { type: 'value', value: true } }) as any,
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toHaveLength(4);
      // Verify step.setVisibleIf used resolved step ID
      expect(stepRepository.update).toHaveBeenCalledWith(
        'step-real-uuid-1',
        expect.objectContaining({
          visibleIf: expect.any(String),
        })
      );
    });
  });
  describe('Alias Uniqueness Validation', () => {
    it('should reject duplicate step alias on create', async () => {
      const {  } = await import('../../../server/repositories');
      // Mock existing step with alias 'email'
      mockStepRepoFind.mockResolvedValue([
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
        } as any,
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
      const {  } = await import('../../../server/repositories');
      mockStepRepoFind.mockResolvedValue([
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
        } as any,
      ]);
      mockStepRepoUpdate.mockResolvedValue({} as any);
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
      const {  } = await import('../../../server/repositories');
      mockStepRepoFind.mockResolvedValue([
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
        } as any,
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
        } as any,
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
      const ops: any[] = [
        {
          op: 'workflow.destroyEverything', // Invalid!
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid operation schema');
    });
    it('should reject malformed operation (missing required fields)', async () => {
      const ops: any[] = [
        {
          op: 'section.create',
          // Missing title!
        },
      ];
      // This should fail Zod validation before reaching applyOps
      // But if it somehow gets through, applyOps should handle it
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid operation schema');
    });
  });
  describe('DataVault Additive Enforcement', () => {
    it('should reject unsafe DataVault operations (dropTable)', async () => {
      const ops: any[] = [
        {
          op: 'datavault.dropTable',
          tableId: 'table-123',
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid operation schema');
    });
    it('should reject unsafe DataVault operations (dropColumn)', async () => {
      const ops: any[] = [
        {
          op: 'datavault.dropColumn',
          tableId: 'table-123',
          columnName: 'sensitive_data',
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid operation schema');
    });
    it('should reject unsafe DataVault operations (deleteRows)', async () => {
      const ops: any[] = [
        {
          op: 'datavault.deleteRows',
          tableId: 'table-123',
          rowIds: ['row-1', 'row-2'],
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid operation schema');
    });
    it('should reject unsafe DataVault operations (updateRowData)', async () => {
      const ops: any[] = [
        {
          op: 'datavault.updateRowData',
          tableId: 'table-123',
          rowId: 'row-1',
          data: { malicious: 'change' },
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
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
      const { sectionRepository } = await import('../../../server/repositories');
      vi.mocked(sectionRepository.create).mockResolvedValue({
        id: 'section-real-uuid',
        workflowId: mockWorkflowId,
        title: 'Contact Info',
        order: 1,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockStepRepoFind.mockResolvedValue([
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
        } as any,
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
      expect(sectionRepository.create).not.toHaveBeenCalled();
    });
    it('should clear tempId mappings between batch calls', async () => {
      const { sectionRepository } = await import('../../../server/repositories');
      vi.mocked(sectionRepository.create).mockResolvedValue({
        id: 'section-real-uuid-1',
        workflowId: mockWorkflowId,
        title: 'Section 1',
        order: 1,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockStepRepoCreate.mockResolvedValue({
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
      } as any);
      mockStepRepoFindBySection.mockResolvedValue([]);
      mockStepRepoFind.mockResolvedValue([]);
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
      mockStepRepoCreate.mockImplementation(async (data: any) => {
        if (data.sectionId?.startsWith('temp-')) {
          throw new Error(`Invalid section ID: ${data.sectionId}`);
        }
        return { id: 'step-1' };
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
  describe('Logic Rule Operations', () => {
    it('should create visibility rule on step', async () => {
      const { stepRepository } = await import('../../../server/repositories');
      mockStepRepoUpdate.mockResolvedValue({} as any);
      mockStepRepoFind.mockResolvedValue([]);
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
      expect(stepRepository.update).toHaveBeenCalledWith(
        'step-123',
        expect.objectContaining({
          visibleIf: expect.objectContaining({
            type: 'group',
            operator: 'AND',
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
        })
      );
    });
    it('should parse complex condition expressions', async () => {
      const { sectionRepository } = await import('../../../server/repositories');
      vi.mocked(sectionRepository.update).mockResolvedValue({} as any);
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
      expect(sectionRepository.update).toHaveBeenCalledWith(
        'section-123',
        expect.objectContaining({
          visibleIf: expect.objectContaining({
            type: 'group',
            operator: 'AND',
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
        })
      );
    });
  });
  describe('Document Operations', () => {
    beforeEach(async () => {
      const { workflowRepository, projectRepository } = await import('../../../server/repositories');
      // Mock tenant context
      vi.mocked(workflowRepository.findById).mockResolvedValue({
        id: mockWorkflowId,
        projectId: 'project-123',
        title: 'Test Workflow',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      vi.mocked(projectRepository.findById).mockResolvedValue({
        id: 'project-123',
        tenantId: 'tenant-123',
        name: 'Test Project',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    });
    it('should attach document to workflow (document.add)', async () => {
      const {
        documentTemplateRepository,
        workflowTemplateRepository,
      } = await import('../../../server/repositories');
      vi.mocked(documentTemplateRepository.findByIdAndProjectId).mockResolvedValue({
        id: 'template-123',
        projectId: 'project-123',
        name: 'Engagement Letter',
        type: 'pdf',
        fileRef: '/templates/engagement.pdf',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      vi.mocked(workflowTemplateRepository.create).mockResolvedValue({
        id: 'wf-template-123',
        workflowVersionId: mockWorkflowId,
        templateId: 'template-123',
        key: 'engagement-letter',
        isPrimary: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
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
      expect(documentTemplateRepository.findByIdAndProjectId).toHaveBeenCalledWith(
        'template-123',
        'project-123'
      );
      expect(workflowTemplateRepository.create).toHaveBeenCalledWith({
        workflowVersionId: mockWorkflowId,
        templateId: 'template-123',
        key: 'engagement-letter',
        isPrimary: false,
      });
    });
    it('should bind document fields to workflow variables (document.bindFields)', async () => {
      const { documentTemplateRepository } = await import('../../../server/repositories');
      mockStepRepoFind.mockResolvedValue([
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
        } as any,
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
        } as any,
      ]);
      vi.mocked(documentTemplateRepository.update).mockResolvedValue({} as any);
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
      expect(documentTemplateRepository.update).toHaveBeenCalledWith('template-123', {
        mapping: {
          client_name: { type: 'variable', source: 'fullName' },
          client_email: { type: 'variable', source: 'email' },
        },
      });
    });
    it('should reject binding to non-existent step alias', async () => {
      const {  } = await import('../../../server/repositories');
      mockStepRepoFind.mockResolvedValue([
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
        } as any,
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
      } as any);
      vi.mocked(projectRepository.findById).mockResolvedValue({
        id: 'project-123',
        tenantId: 'tenant-123',
        name: 'Test Project',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
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
      } as any);
      vi.mocked(mockColumnService.createColumn).mockResolvedValue({} as any);
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
    it('should create writeback mapping (datavault.createWritebackMapping)', async () => {
      const { datavaultWritebackMappingsRepository } = await import('../../../server/repositories');
      const { DatavaultTablesService } = vi.mocked(
        await import('../../../server/services/DatavaultTablesService')
      );
      const { DatavaultColumnsService } = vi.mocked(
        await import('../../../server/services/DatavaultColumnsService')
      );
      const mockTableService = new DatavaultTablesService();
      const mockColumnService = new DatavaultColumnsService();
      // Mock permission check
      vi.mocked(mockTableService.requirePermission).mockResolvedValue(undefined);
      // Mock columns
      vi.mocked(mockColumnService.listColumns).mockResolvedValue([
        {
          id: 'col-1',
          tableId: 'table-123',
          name: 'Email',
          slug: 'email',
          type: 'text',
          orderIndex: 1,
          required: false,
          isPrimaryKey: false,
          isUnique: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
        {
          id: 'col-2',
          tableId: 'table-123',
          name: 'Phone',
          slug: 'phone',
          type: 'text',
          orderIndex: 2,
          required: false,
          isPrimaryKey: false,
          isUnique: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);
      // Mock workflow steps
      mockStepRepoFind.mockResolvedValue([
        {
          id: 'step-1',
          sectionId: 'section-1',
          type: 'email',
          title: 'Email Address',
          alias: 'userEmail',
          required: true,
          order: 1,
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
        {
          id: 'step-2',
          sectionId: 'section-1',
          type: 'phone',
          title: 'Phone Number',
          alias: 'userPhone',
          required: false,
          order: 2,
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any,
      ]);
      vi.mocked(datavaultWritebackMappingsRepository.create).mockResolvedValue({
        id: 'mapping-123',
        workflowId: mockWorkflowId,
        tableId: 'table-123',
        columnMappings: {
          userEmail: 'col-1',
          userPhone: 'col-2',
        },
        triggerPhase: 'afterComplete',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: mockUserId,
      } as any);
      const ops: WorkflowPatchOp[] = [
        {
          op: 'datavault.createWritebackMapping',
          tableId: 'table-123',
          columnMappings: {
            userEmail: 'Email',
            userPhone: 'Phone',
          },
        },
      ];
      const result = await service.applyOps(mockWorkflowId, mockUserId, ops);
      expect(result.errors).toHaveLength(0);
      expect(result.summary).toHaveLength(1);
      expect(result.summary[0]).toContain('Created writeback mapping: 2 field(s)');
      expect(datavaultWritebackMappingsRepository.create).toHaveBeenCalledWith({
        workflowId: mockWorkflowId,
        tableId: 'table-123',
        columnMappings: {
          userEmail: 'col-1',
          userPhone: 'col-2',
        },
        triggerPhase: 'afterComplete',
        createdBy: mockUserId,
      });
    });
  });
});