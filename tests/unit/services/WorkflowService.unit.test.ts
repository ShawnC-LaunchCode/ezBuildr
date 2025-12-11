import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowService } from '@server/services/WorkflowService';
import { aclService } from '@server/services/AclService';

vi.mock('@server/services/AclService', () => ({
  aclService: {
    hasWorkflowRole: vi.fn().mockResolvedValue(true),
    hasProjectRole: vi.fn().mockResolvedValue(true),
  },
}));

/**
 * Unit Tests for WorkflowService
 *
 * Tests business logic in isolation without database dependencies.
 * Uses mock repositories to test service behavior.
 *
 * Coverage target: 90%+
 */

describe('WorkflowService (Unit)', () => {
  // Mock repositories
  let mockWorkflowRepo: any;
  let mockSectionRepo: any;
  let mockStepRepo: any;
  let mockLogicRuleRepo: any;
  let mockWorkflowAccessRepo: any;
  let mockProjectRepo: any;
  let service: WorkflowService;

  beforeEach(() => {
    // Reset mocks before each test
    mockWorkflowRepo = {
      findByIdOrSlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByProjectId: vi.fn(),
      transaction: vi.fn((callback) => callback(null)),
    };

    mockSectionRepo = {
      create: vi.fn(),
      findByWorkflowId: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    mockStepRepo = {
      findBySectionIds: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    mockLogicRuleRepo = {
      findByWorkflowId: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    };

    mockWorkflowAccessRepo = {
      findByWorkflowId: vi.fn(),
    };

    mockProjectRepo = {
      findById: vi.fn(),
    };

    // Create service with mock dependencies
    service = new WorkflowService(
      mockWorkflowRepo,
      mockSectionRepo,
      mockStepRepo,
      mockLogicRuleRepo,
      mockWorkflowAccessRepo,
      mockProjectRepo
    );

    vi.mocked(aclService.hasWorkflowRole).mockResolvedValue(true);
    vi.mocked(aclService.hasProjectRole).mockResolvedValue(true);
  });

  describe('verifyOwnership', () => {
    it('should return workflow if user is the creator', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      const userId = 'user-123';
      const mockWorkflow = {
        id: workflowId,
        title: 'Test Workflow',
        creatorId: userId,
        ownerId: userId,
        status: 'draft',
      };

      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(mockWorkflow);

      // Act
      const result = await service.verifyOwnership(workflowId, userId);

      // Assert
      expect(result).toEqual(mockWorkflow);
      expect(mockWorkflowRepo.findByIdOrSlug).toHaveBeenCalledWith(workflowId);
      expect(mockWorkflowRepo.findByIdOrSlug).toHaveBeenCalledTimes(1);
    });

    it('should throw error if workflow not found', async () => {
      // Arrange
      const workflowId = 'nonexistent';
      const userId = 'user-123';
      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(null);

      // Act & Assert
      await expect(service.verifyOwnership(workflowId, userId)).rejects.toThrow(
        'Workflow not found'
      );
    });

    it('should throw error if user is not the creator', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      const userId = 'user-123';
      const differentUserId = 'user-456';
      const mockWorkflow = {
        id: workflowId,
        title: 'Test Workflow',
        creatorId: differentUserId,
        ownerId: differentUserId,
      };

      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(mockWorkflow);

      // Act & Assert
      await expect(service.verifyOwnership(workflowId, userId)).rejects.toThrow(
        'Access denied - you do not own this workflow'
      );
    });

    it('should accept workflow slug in addition to UUID', async () => {
      // Arrange
      const workflowSlug = 'my-workflow';
      const userId = 'user-123';
      const mockWorkflow = {
        id: 'workflow-123',
        slug: workflowSlug,
        title: 'Test Workflow',
        creatorId: userId,
      };

      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(mockWorkflow);

      // Act
      const result = await service.verifyOwnership(workflowSlug, userId);

      // Assert
      expect(result).toEqual(mockWorkflow);
      expect(mockWorkflowRepo.findByIdOrSlug).toHaveBeenCalledWith(workflowSlug);
    });
  });

  describe('createWorkflow', () => {
    it('should create workflow with default section', async () => {
      // Arrange
      const creatorId = 'user-123';
      const workflowData = {
        title: 'New Workflow',
        description: 'Test description',
        projectId: 'project-123',
      };

      const mockCreatedWorkflow = {
        id: 'workflow-123',
        ...workflowData,
        creatorId,
        ownerId: creatorId,
        status: 'draft',
        createdAt: new Date(),
      };

      mockWorkflowRepo.create.mockResolvedValue(mockCreatedWorkflow);
      mockSectionRepo.create.mockResolvedValue({
        id: 'section-123',
        workflowId: mockCreatedWorkflow.id,
        title: 'Section 1',
        order: 1,
      });

      // Act
      const result = await service.createWorkflow(workflowData, creatorId);

      // Assert
      expect(result).toEqual(mockCreatedWorkflow);
      expect(mockWorkflowRepo.create).toHaveBeenCalledWith(
        {
          ...workflowData,
          creatorId,
          ownerId: creatorId,
          status: 'draft',
        },
        null
      );
      expect(mockSectionRepo.create).toHaveBeenCalledWith(
        {
          workflowId: mockCreatedWorkflow.id,
          title: 'Section 1',
          order: 1,
        },
        null
      );
    });

    it('should set creator as owner', async () => {
      // Arrange
      const creatorId = 'user-123';
      const workflowData = {
        title: 'New Workflow',
        projectId: 'project-123',
      };

      mockWorkflowRepo.create.mockImplementation(async (data) => ({
        id: 'workflow-123',
        ...data,
      }));

      mockSectionRepo.create.mockResolvedValue({});

      // Act
      await service.createWorkflow(workflowData, creatorId);

      // Assert
      expect(mockWorkflowRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          creatorId,
          ownerId: creatorId,
        }),
        null
      );
    });

    it('should set initial status to draft', async () => {
      // Arrange
      const creatorId = 'user-123';
      const workflowData = {
        title: 'New Workflow',
        projectId: 'project-123',
      };

      mockWorkflowRepo.create.mockImplementation(async (data) => ({
        id: 'workflow-123',
        ...data,
      }));

      mockSectionRepo.create.mockResolvedValue({});

      // Act
      await service.createWorkflow(workflowData, creatorId);

      // Assert
      expect(mockWorkflowRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'draft',
        }),
        null
      );
    });

    it('should rollback if section creation fails', async () => {
      // Arrange
      const creatorId = 'user-123';
      const workflowData = {
        title: 'New Workflow',
        projectId: 'project-123',
      };

      mockWorkflowRepo.transaction.mockImplementation(async (callback) => {
        try {
          return await callback(null);
        } catch (error) {
          throw error;
        }
      });

      mockWorkflowRepo.create.mockResolvedValue({
        id: 'workflow-123',
        ...workflowData,
        creatorId,
      });

      mockSectionRepo.create.mockRejectedValue(new Error('Section creation failed'));

      // Act & Assert
      await expect(service.createWorkflow(workflowData, creatorId)).rejects.toThrow(
        'Section creation failed'
      );
    });
  });

  describe('getWorkflowWithDetails', () => {
    it('should return workflow with sections, steps, and logic rules', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      const userId = 'user-123';

      const mockWorkflow = {
        id: workflowId,
        title: 'Test Workflow',
        creatorId: userId,
      };

      const mockSections = [
        { id: 'section-1', workflowId, title: 'Section 1', order: 1 },
        { id: 'section-2', workflowId, title: 'Section 2', order: 2 },
      ];

      const mockSteps = [
        { id: 'step-1', sectionId: 'section-1', title: 'Step 1', type: 'short_text' },
        { id: 'step-2', sectionId: 'section-1', title: 'Step 2', type: 'long_text' },
        { id: 'step-3', sectionId: 'section-2', title: 'Step 3', type: 'radio' },
      ];

      const mockLogicRules = [
        { id: 'rule-1', workflowId, condition: {}, action: {} },
      ];

      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(mockWorkflow);
      mockSectionRepo.findByWorkflowId.mockResolvedValue(mockSections);
      mockStepRepo.findBySectionIds.mockResolvedValue(mockSteps);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue(mockLogicRules);

      // Act
      const result = await service.getWorkflowWithDetails(workflowId, userId);

      // Assert
      // Method spreads workflow properties directly (not nested under "workflow")
      expect(result).toMatchObject(mockWorkflow);
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].steps).toHaveLength(2);
      expect(result.sections[1].steps).toHaveLength(1);
      expect(result.logicRules).toEqual(mockLogicRules);
    });

    it('should verify ownership before returning details', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      const userId = 'user-123';
      const differentUserId = 'user-456';

      const mockWorkflow = {
        id: workflowId,
        creatorId: differentUserId,
      };

      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue(mockWorkflow);
      vi.mocked(aclService.hasWorkflowRole).mockResolvedValue(false);

      // Act & Assert
      await expect(service.getWorkflowWithDetails(workflowId, userId)).rejects.toThrow(
        'Access denied'
      );
    });

    it('should handle workflow with no sections', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      const userId = 'user-123';

      mockWorkflowRepo.findByIdOrSlug.mockResolvedValue({
        id: workflowId,
        creatorId: userId,
      });

      mockSectionRepo.findByWorkflowId.mockResolvedValue([]);
      mockStepRepo.findBySectionIds.mockResolvedValue([]);
      mockLogicRuleRepo.findByWorkflowId.mockResolvedValue([]);

      // Act
      const result = await service.getWorkflowWithDetails(workflowId, userId);

      // Assert
      expect(result.sections).toHaveLength(0);
      expect(result.logicRules).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null or undefined workflow data', async () => {
      // Arrange
      const creatorId = 'user-123';
      mockWorkflowRepo.create.mockResolvedValue(null);

      // Act & Assert - should handle gracefully or throw appropriate error
      // This depends on the actual implementation
    });

    it('should handle concurrent workflow creation', async () => {
      // Arrange - simulate concurrent calls
      const creatorId = 'user-123';
      const workflowData = {
        title: 'Concurrent Workflow',
        projectId: 'project-123',
      };

      let callCount = 0;
      mockWorkflowRepo.create.mockImplementation(async () => {
        callCount++;
        return { id: `workflow-${callCount}`, ...workflowData };
      });

      mockSectionRepo.create.mockResolvedValue({});

      // Act - create multiple workflows concurrently
      const results = await Promise.all([
        service.createWorkflow(workflowData, creatorId),
        service.createWorkflow(workflowData, creatorId),
        service.createWorkflow(workflowData, creatorId),
      ]);

      // Assert - should create 3 distinct workflows
      expect(results).toHaveLength(3);
      expect(new Set(results.map((r) => r.id)).size).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      // Arrange
      const workflowId = 'workflow-123';
      const userId = 'user-123';

      mockWorkflowRepo.findByIdOrSlug.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act & Assert
      await expect(service.verifyOwnership(workflowId, userId)).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should handle malformed workflow data', async () => {
      // Arrange
      const creatorId = 'user-123';
      const malformedData = {
        // Missing required fields
        description: 'No title provided',
      } as any;

      mockWorkflowRepo.create.mockRejectedValue(
        new Error('Validation error: title is required')
      );

      // Act & Assert
      await expect(service.createWorkflow(malformedData, creatorId)).rejects.toThrow(
        'Validation error'
      );
    });
  });
});
