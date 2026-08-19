import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { SignatureRequest } from '@shared/schema';
import type { DbTransaction } from '../../../server/repositories';
import { runWithTenantContext } from '../../../server/utils/rlsContext';

import { SignatureRequestService } from '../../../server/services/SignatureRequestService';

const mockTx = { __fakeTx: true } as unknown as DbTransaction;

describe('SignatureRequestService', () => {
  let service: SignatureRequestService;
  let mockSignatureRequestRepo: {
    findById: Mock;
    findByToken: Mock;
    findPendingByProjectId: Mock;
    findExpired: Mock;
    create: Mock;
    updateStatus: Mock;
    createEvent: Mock;
    getEvents: Mock;
  };
  let mockWorkflowRepo: { findById: Mock };
  let mockProjectRepo: { findById: Mock };
  let mockAclService: { hasProjectRole: Mock };

  const mockTenantId = 'tenant-1';
  const mockWorkflowId = 'workflow-1';
  const mockProjectId = 'project-1';
  const mockRequestId = 'req-1';
  const mockUserId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();

    mockSignatureRequestRepo = {
      findById: vi.fn(),
      findByToken: vi.fn(),
      findPendingByProjectId: vi.fn(),
      findExpired: vi.fn(),
      create: vi.fn(),
      updateStatus: vi.fn(),
      createEvent: vi.fn(),
      getEvents: vi.fn(),
    };
    mockWorkflowRepo = { findById: vi.fn() };
    mockProjectRepo = { findById: vi.fn() };
    mockAclService = { hasProjectRole: vi.fn() };

    service = new SignatureRequestService(
      mockSignatureRequestRepo as unknown as ConstructorParameters<typeof SignatureRequestService>[0],
      mockWorkflowRepo as unknown as ConstructorParameters<typeof SignatureRequestService>[1],
      mockProjectRepo as unknown as ConstructorParameters<typeof SignatureRequestService>[2],
      mockAclService as unknown as ConstructorParameters<typeof SignatureRequestService>[3]
    );
  });

  describe('createSignatureRequest', () => {
    it('creates the request and the sent event in one supplied transaction', async () => {
      mockWorkflowRepo.findById.mockResolvedValue({ id: mockWorkflowId });
      mockProjectRepo.findById.mockResolvedValue({ id: mockProjectId });
      mockSignatureRequestRepo.create.mockResolvedValue({
        id: mockRequestId,
        signerEmail: 'a@b.com',
        signerName: 'A',
      });
      mockSignatureRequestRepo.createEvent.mockResolvedValue({ id: 'evt-1' });

      const data = {
        runId: 'run-1',
        workflowId: mockWorkflowId,
        nodeId: 'node-1',
        tenantId: mockTenantId,
        projectId: mockProjectId,
        signerEmail: 'a@b.com',
        signerName: 'A',
        status: 'pending' as const,
        expiresAt: new Date(),
      };

      await service.createSignatureRequest(data as unknown as Parameters<typeof service.createSignatureRequest>[0], mockTx);

      expect(mockSignatureRequestRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: mockTenantId }),
        mockTx
      );
      expect(mockSignatureRequestRepo.createEvent).toHaveBeenCalledWith(
        mockRequestId,
        'sent',
        expect.any(Object),
        mockTx
      );
    });

    it('throws on an ambient tenant that disagrees with data.tenantId, and never reaches the repository', async () => {
      const data = {
        runId: 'run-1',
        workflowId: mockWorkflowId,
        nodeId: 'node-1',
        tenantId: 'tenant-B',
        projectId: mockProjectId,
        signerEmail: 'a@b.com',
        signerName: 'A',
        status: 'pending' as const,
        expiresAt: new Date(),
      };

      await expect(
        runWithTenantContext('tenant-A', () =>
          service.createSignatureRequest(data as unknown as Parameters<typeof service.createSignatureRequest>[0])
        )
      ).rejects.toThrow(/tenant mismatch/i);

      expect(mockWorkflowRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('RLS-2c: fails closed with no tenant in context', () => {
    it('getSignatureRequest rejects with no ambient tenant and no supplied tx, and never reaches the repository', async () => {
      await expect(
        service.getSignatureRequest(mockRequestId, mockUserId)
      ).rejects.toThrow('RLS: no tenant in context.');
      expect(mockSignatureRequestRepo.findById).not.toHaveBeenCalled();
    });

    it('createSignatureRequest rejects with no ambient tenant and no supplied tx, and never reaches the repository', async () => {
      const data = {
        runId: 'run-1',
        workflowId: mockWorkflowId,
        nodeId: 'node-1',
        tenantId: mockTenantId,
        projectId: mockProjectId,
        signerEmail: 'a@b.com',
        signerName: 'A',
        status: 'pending' as const,
        expiresAt: new Date(),
      };

      await expect(
        service.createSignatureRequest(data as unknown as Parameters<typeof service.createSignatureRequest>[0])
      ).rejects.toThrow('RLS: no tenant in context.');
      expect(mockWorkflowRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('token-based public methods do NOT depend on ambient tenant context', () => {
    it('getSignatureRequestByToken succeeds with no ambient tenant when the request is not expired/pending', async () => {
      mockSignatureRequestRepo.findByToken.mockResolvedValue({
        id: mockRequestId,
        tenantId: mockTenantId,
        status: 'signed',
        expiresAt: new Date(Date.now() + 86_400_000),
      } as unknown as SignatureRequest);

      const result = await service.getSignatureRequestByToken('sometoken');
      expect(result.id).toBe(mockRequestId);
      // no writes for an already-resolved (non-pending) request
      expect(mockSignatureRequestRepo.updateStatus).not.toHaveBeenCalled();
      expect(mockSignatureRequestRepo.createEvent).not.toHaveBeenCalled();
    });

    // signDocument (status 'pending') always opens a real `withTenant`
    // transaction — unlike every other test in this file it cannot be proven
    // against mocked repositories alone, so that proof lives in
    // tests/integration/rls2c-miscCluster.test.ts against a real database.
  });
});
