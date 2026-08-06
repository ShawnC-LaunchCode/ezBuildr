import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { RunDocumentDelivery } from '@shared/schema';

import { RunDocumentDeliveryRepository } from '../../../server/repositories/RunDocumentDeliveryRepository';

describe('RunDocumentDeliveryRepository', () => {
  let repository: RunDocumentDeliveryRepository;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const mockReturnValue: unknown = [];

    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      for: vi.fn().mockReturnThis(),
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mockDb)),
      execute: vi.fn(),
      then: vi.fn((resolve: (val: unknown) => unknown) => resolve(mockReturnValue)),
    };

    repository = new RunDocumentDeliveryRepository(mockDb as never);
  });

  describe('createDeliveries', () => {
    it('should insert multiple delivery records and return created items', async () => {
      const mockCreated: Partial<RunDocumentDelivery>[] = [
        {
          id: 'del-1',
          runId: 'run-1',
          destinationType: 'email',
          status: 'pending',
        },
      ];

      mockDb.returning.mockResolvedValueOnce(mockCreated);

      const result = await repository.createDeliveries([
        {
          runId: 'run-1',
          workflowId: 'wf-1',
          tenantId: 'tenant-1',
          destinationType: 'email',
          destinationConfig: { to: 'test@example.com' },
          status: 'pending',
          attempts: 0,
          maxAttempts: 5,
          nextAttemptAt: new Date(),
          auditLog: [],
        },
      ]);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
      expect(result).toEqual(mockCreated);
    });

    it('should return empty array if empty list provided', async () => {
      const result = await repository.createDeliveries([]);
      expect(result).toEqual([]);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });

  describe('findByRunId', () => {
    it('should query deliveries by runId ordered by createdAt', async () => {
      const mockDeliveries: Partial<RunDocumentDelivery>[] = [
        { id: 'del-1', runId: 'run-1' },
      ];
      mockDb.orderBy.mockResolvedValueOnce(mockDeliveries);

      const result = await repository.findByRunId('run-1');
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toEqual(mockDeliveries);
    });
  });

  describe('findByRunIdAndTenantId', () => {
    it('should scope the run query to its tenant', async () => {
      const mockDeliveries: Partial<RunDocumentDelivery>[] = [
        { id: 'del-1', runId: 'run-1', tenantId: 'tenant-1' },
      ];
      mockDb.orderBy.mockResolvedValueOnce(mockDeliveries);

      const result = await repository.findByRunIdAndTenantId('run-1', 'tenant-1');

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toEqual(mockDeliveries);
    });
  });

  describe('findByIdAndTenantId', () => {
    it('should find single delivery matching id and tenantId', async () => {
      const mockDelivery: Partial<RunDocumentDelivery> = {
        id: 'del-1',
        tenantId: 'tenant-1',
      };
      mockDb.limit.mockResolvedValueOnce([mockDelivery]);

      const result = await repository.findByIdAndTenantId('del-1', 'tenant-1');
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toEqual(mockDelivery);
    });
  });

  describe('markDelivered', () => {
    it('should update status to delivered and append audit log entry', async () => {
      const mockUpdated: Partial<RunDocumentDelivery> = {
        id: 'del-1',
        status: 'delivered',
      };
      mockDb.returning.mockResolvedValueOnce([mockUpdated]);

      const auditEntry = {
        timestamp: new Date().toISOString(),
        attempt: 1,
        status: 'delivered' as const,
      };

      const result = await repository.markDelivered('del-1', auditEntry);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
      expect(result.status).toBe('delivered');
    });
  });

  describe('markRetryOrFailed', () => {
    it('should update status to retry and set nextAttemptAt', async () => {
      const mockUpdated: Partial<RunDocumentDelivery> = {
        id: 'del-1',
        status: 'retry',
      };
      mockDb.returning.mockResolvedValueOnce([mockUpdated]);

      const auditEntry = {
        timestamp: new Date().toISOString(),
        attempt: 1,
        status: 'retry' as const,
        error: 'Network Timeout',
      };

      const result = await repository.markRetryOrFailed('del-1', {
        error: 'Network Timeout',
        auditEntry,
        nextAttemptAt: new Date(Date.now() + 5000),
        isFinalFailure: false,
      });

      expect(mockDb.update).toHaveBeenCalled();
      expect(result.status).toBe('retry');
    });

    it('should update status to failed when isFinalFailure is true', async () => {
      const mockUpdated: Partial<RunDocumentDelivery> = {
        id: 'del-1',
        status: 'failed',
      };
      mockDb.returning.mockResolvedValueOnce([mockUpdated]);

      const auditEntry = {
        timestamp: new Date().toISOString(),
        attempt: 5,
        status: 'failed' as const,
        error: 'Max retries exceeded',
      };

      const result = await repository.markRetryOrFailed('del-1', {
        error: 'Max retries exceeded',
        auditEntry,
        isFinalFailure: true,
      });

      expect(mockDb.update).toHaveBeenCalled();
      expect(result.status).toBe('failed');
    });
  });

  describe('resetForRetry', () => {
    it('should reset failed delivery to pending', async () => {
      const mockUpdated: Partial<RunDocumentDelivery> = {
        id: 'del-1',
        status: 'pending',
        attempts: 0,
      };
      mockDb.returning.mockResolvedValueOnce([mockUpdated]);

      const result = await repository.resetForRetry('del-1', 'tenant-1');
      expect(mockDb.update).toHaveBeenCalled();
      expect(result?.status).toBe('pending');
    });
  });

  describe('claimBatch', () => {
    it('should query pending/stale records with FOR UPDATE SKIP LOCKED and update them to processing', async () => {
      const mockCandidate: Partial<RunDocumentDelivery> = { id: 'del-1', status: 'pending' };
      const mockUpdated: Partial<RunDocumentDelivery>[] = [
        { id: 'del-1', status: 'processing' },
      ];
      mockDb.for.mockResolvedValueOnce([mockCandidate]);
      mockDb.returning.mockResolvedValueOnce(mockUpdated);

      const result = await repository.claimBatch({ limit: 5 });
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.for).toHaveBeenCalledWith('update', { skipLocked: true });
      expect(mockDb.update).toHaveBeenCalled();
      expect(result).toEqual(mockUpdated);
    });
  });
});
