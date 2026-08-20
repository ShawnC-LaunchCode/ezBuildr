import { describe, it, expect, beforeEach, vi, type Mock, beforeAll, afterAll } from 'vitest';
import type { ReviewTask } from '@shared/schema';
import type { DbTransaction } from '../../../server/repositories';

import { ReviewTaskService } from '../../../server/services/ReviewTaskService';

// RLS-2c: ReviewTaskService has no `tenantId` argument (access is gated by
// userId + ACL, review_tasks itself is a direct-tenant_id RLS table), so
// `withTx` is the reuse-or-open-ambient half of CollectionService's pilot
// shape. Passing a truthy `mockTx` makes it reuse that transaction directly
// instead of falling through to `withCurrentTenant`, which would throw
// outside a real request's async context.
const mockTx = { __fakeTx: true } as unknown as DbTransaction;

describe('ReviewTaskService', () => {
  let service: ReviewTaskService;
  let mockReviewTaskRepo: {
    findById: Mock;
    findByReviewerId: Mock;
    findPendingByProjectId: Mock;
    create: Mock;
    updateStatus: Mock;
  };
  let mockWorkflowRepo: { findById: Mock };
  let mockProjectRepo: { findById: Mock };
  let mockAclService: { hasProjectRole: Mock };

  const mockWorkflowId = '550e8400-e29b-41d4-a716-446655440000';
  const mockProjectId = '660e8400-e29b-41d4-a716-446655440001';
  const mockTaskId = '770e8400-e29b-41d4-a716-446655440002';
  const mockUserId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();

    mockReviewTaskRepo = {
      findById: vi.fn(),
      findByReviewerId: vi.fn(),
      findPendingByProjectId: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
    };
    mockWorkflowRepo = { findById: vi.fn() };
    mockProjectRepo = { findById: vi.fn() };
    mockAclService = { hasProjectRole: vi.fn() };

    service = new ReviewTaskService(
      mockReviewTaskRepo as unknown as ConstructorParameters<typeof ReviewTaskService>[0],
      mockWorkflowRepo as unknown as ConstructorParameters<typeof ReviewTaskService>[1],
      mockProjectRepo as unknown as ConstructorParameters<typeof ReviewTaskService>[2],
      mockAclService as unknown as ConstructorParameters<typeof ReviewTaskService>[3]
    );
  });

  describe('createReviewTask', () => {
    // AC5 — multi-repository service in this cluster: createReviewTask spans
    // workflowRepo, projectRepo AND reviewTaskRepo inside one `withTx`. The
    // discriminating assertion is the SAME transaction object reaching two
    // repositories, not merely two calls scoped to the same tenant.
    it('opens exactly one transaction shared by workflowRepo, projectRepo and reviewTaskRepo', async () => {
      const data = { workflowId: mockWorkflowId, projectId: mockProjectId, reviewerId: mockUserId };
      mockWorkflowRepo.findById.mockResolvedValue({ id: mockWorkflowId });
      mockProjectRepo.findById.mockResolvedValue({ id: mockProjectId });
      mockReviewTaskRepo.create.mockResolvedValue({ id: mockTaskId, ...data, status: 'pending' } as unknown as ReviewTask);

      await service.createReviewTask(data as unknown as Parameters<typeof service.createReviewTask>[0], mockTx);

      expect(mockWorkflowRepo.findById).toHaveBeenCalledWith(mockWorkflowId, mockTx);
      expect(mockProjectRepo.findById).toHaveBeenCalledWith(mockProjectId, mockTx);
      expect(mockReviewTaskRepo.create).toHaveBeenCalledWith(data, mockTx);
    });

    it('throws if workflow does not exist', async () => {
      mockWorkflowRepo.findById.mockResolvedValue(undefined);

      await expect(
        service.createReviewTask(
          { workflowId: mockWorkflowId, projectId: mockProjectId } as unknown as Parameters<typeof service.createReviewTask>[0],
          mockTx
        )
      ).rejects.toThrow('Workflow not found');
    });
  });

  describe('approveTask', () => {
    it('approves a pending task for its designated reviewer, in one transaction', async () => {
      const task = {
        id: mockTaskId,
        projectId: mockProjectId,
        status: 'pending',
        reviewerId: mockUserId,
      } as unknown as ReviewTask;

      mockReviewTaskRepo.findById.mockResolvedValue(task);
      mockProjectRepo.findById.mockResolvedValue({ id: mockProjectId });
      mockAclService.hasProjectRole.mockResolvedValue(true);
      mockReviewTaskRepo.updateStatus.mockResolvedValue({ ...task, status: 'approved' });

      const result = await service.approveTask(mockTaskId, mockUserId, 'looks good', mockTx);

      expect(result.status).toBe('approved');
      expect(mockReviewTaskRepo.updateStatus).toHaveBeenCalledWith(mockTaskId, 'approved', 'looks good', mockTx);
    });
  });

  describe('RLS-2c: fails closed with no tenant in context', () => {
  // Staged rollout: `withCurrentTenant` only THROWS on a missing tenant once
  // RLS is enforced. Before that it warns and runs unscoped — failing early
  // buys no safety while every row is visible anyway, and throwing
  // unconditionally broke real customer paths (anonymous runs, run tokens).
  // These assertions are about the ENFORCED behaviour, so enable it here.
  const priorRlsEnforced = process.env.RLS_ENFORCED;
  beforeAll(() => { process.env.RLS_ENFORCED = "true"; });
  afterAll(() => {
    if (priorRlsEnforced === undefined) { delete process.env.RLS_ENFORCED; }
    else { process.env.RLS_ENFORCED = priorRlsEnforced; }
  });

    it('getReviewTask rejects with no ambient tenant and no supplied tx, and never reaches the repository', async () => {
      await expect(service.getReviewTask(mockTaskId, mockUserId)).rejects.toThrow(
        'RLS: no tenant in context.'
      );
      expect(mockReviewTaskRepo.findById).not.toHaveBeenCalled();
    });

    it('createReviewTask rejects with no ambient tenant and no supplied tx, and never reaches the repository', async () => {
      await expect(
        service.createReviewTask({
          workflowId: mockWorkflowId,
          projectId: mockProjectId,
        } as unknown as Parameters<typeof service.createReviewTask>[0])
      ).rejects.toThrow('RLS: no tenant in context.');
      expect(mockWorkflowRepo.findById).not.toHaveBeenCalled();
    });
  });
});
