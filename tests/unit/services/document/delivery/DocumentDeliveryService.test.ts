import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import type { RunDocumentDelivery, Workflow, WorkflowRun } from '@shared/schema';
import type { FinalBlockConfig } from '@shared/types/stepConfigs';

import {
  organizationRepository,
  runDocumentDeliveryRepository,
  runGeneratedDocumentsRepository,
  userRepository,
  workflowRepository,
  workflowRunRepository,
} from '../../../../../server/repositories';
import {
  cloudStorageDeliveryAdapter,
  emailDeliveryAdapter,
  webhookDeliveryAdapter,
} from '../../../../../server/services/document/delivery/adapters';
import {
  DocumentDeliveryService,
  sanitizeDeliveryForResponse,
} from '../../../../../server/services/document/delivery/DocumentDeliveryService';
import { runDataService } from '../../../../../server/services/workflow-runs/RunDataService';
import { decrypt } from '../../../../../server/utils/encryption';

// RLS-5: the run/document path now opens tenant-scoped transactions via
// `withCurrentTenant` (server/utils/rlsContext.ts), which calls the real
// `db.transaction`. This suite calls those services directly rather than
// through HTTP, so `db` must be mocked or the chain throws "Database not
// initialized". The stub `tx` needs a working `execute` — that is what
// `applyTenantToTransaction` uses to set the GUC.
// RLS-5: this service now opens tenant-scoped transactions via `rlsContext`,
// which reaches for a REAL pool and throws "Database not initialized" in a unit
// test. These tests exercise business logic, not the transaction — that is
// proven against a real database under `RLS_RESTRICTED=true`. Replace the
// wrappers with pass-throughs so the mocked repositories below still receive
// the calls they assert on.
//
// Spreads `importOriginal` on purpose: the module also exports
// `getCurrentTenantId`/`setCurrentTenantId`, and a partial mock would silently
// make those undefined.
const RLS_TX_SENTINEL = { __rlsMockTx: true, execute: vi.fn().mockResolvedValue({ rows: [] }) };

vi.mock('../../../../../server/utils/rlsContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../server/utils/rlsContext')>();
  return {
    ...actual,
    // A truthy sentinel, not `undefined`: the service's `withTx` branches on
    // whether it was handed a transaction, and repositories treat a falsy one
    // as "use the pool". Passing undefined would take a different path than
    // production does and quietly test the wrong branch.
    withCurrentTenant: <T,>(fn: (tx: unknown) => Promise<T>) => fn(RLS_TX_SENTINEL),
    withTenant: <T,>(_tenantId: string, fn: (tx: unknown) => Promise<T>) => fn(RLS_TX_SENTINEL),
    withVerifiedIdentifier: <T,>(_guc: string, _value: string, fn: (tx: unknown) => Promise<T>) => fn(RLS_TX_SENTINEL),
  };
});

vi.mock("../../../../../server/db", () => {
  const tx = { execute: vi.fn().mockResolvedValue(undefined) };
  return {
    db: {
      ...tx,
      transaction: vi.fn(async (callback: (t: unknown) => Promise<unknown>) => callback(tx)),
    },
    getDb: vi.fn(() => ({ ...tx })),
    initializeDatabase: vi.fn(),
  };
});


vi.mock('../../../../../server/repositories', () => ({
  runDocumentDeliveryRepository: {
    createDeliveries: vi.fn(),
    claimBatch: vi.fn(),
    findByIdAndTenantId: vi.fn(),
    findByRunIdAndTenantId: vi.fn(),
    markDelivered: vi.fn(),
    markRetryOrFailed: vi.fn(),
    resetForRetry: vi.fn(),
  },
  workflowRunRepository: {
    findById: vi.fn(),
  },
  workflowRepository: {
    findById: vi.fn(),
  },
  userRepository: {
    findById: vi.fn(),
  },
  organizationRepository: {
    findById: vi.fn(),
  },
  projectRepository: {
    findById: vi.fn(),
  },
  runGeneratedDocumentsRepository: {
    findByRunId: vi.fn(),
  },
}));

vi.mock('../../../../../server/services/workflow-runs/RunDataService', () => ({
  runDataService: {
    buildForRun: vi.fn(),
  },
}));

vi.mock('../../../../../server/services/document/delivery/adapters', () => ({
  emailDeliveryAdapter: {
    deliver: vi.fn(),
  },
  webhookDeliveryAdapter: {
    deliver: vi.fn(),
  },
  cloudStorageDeliveryAdapter: {
    deliver: vi.fn(),
  },
}));

describe('DocumentDeliveryService', () => {
  let service: DocumentDeliveryService;

  beforeEach(() => {
    service = new DocumentDeliveryService();
    vi.clearAllMocks();
    vi.mocked(userRepository.findById).mockResolvedValue({
      id: 'user-owner-1',
      tenantId: '11111111-1111-1111-1111-111111111111',
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockRun = {
    id: '33333333-3333-3333-3333-333333333333',
    workflowId: '44444444-4444-4444-4444-444444444444',
    ownerType: 'user',
    ownerUuid: 'user-owner-1',
    workflowVersionId: null,
    runToken: 'token-123',
    tokenExpiresAt: null,
    createdBy: 'user-001',
    currentPageId: null,
    progress: 100,
    completed: true,
    completedAt: new Date(),
    generationStatus: 'done',
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    clientEmail: null,
    portalAccessKey: null,
    accessMode: 'anonymous' as const,
    shareTokenHash: null,
    shareTokenExpiresAt: null,
  } as unknown as WorkflowRun;

  const mockWorkflow = {
    id: '44444444-4444-4444-4444-444444444444',
    title: 'Test Workflow',
    description: null,
    creatorId: null,
    ownerId: null,
    modeOverride: null,
    publicLink: null,
    name: 'Test Workflow',
    projectId: null,
    currentVersionId: null,
    isPublic: false,
    slug: 'test-wf',
    requireLogin: false,
    intakeConfig: {},
    settings: {},
    pinnedVersionId: null,
    status: 'draft',
    ownerType: 'user',
    ownerUuid: 'user-owner-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    sourceBlueprintId: null,
  } as unknown as Workflow;

  describe('enqueueDeliveriesForRun()', () => {
    it('should enqueue active destinations and encrypt webhook secret', async () => {
      vi.mocked(workflowRunRepository.findById).mockResolvedValue(mockRun);
      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow);
      vi.mocked(runDocumentDeliveryRepository.createDeliveries).mockImplementation(
        async (records) => records as unknown as RunDocumentDelivery[]
      );

      const finalConfig: FinalBlockConfig = {
        markdownHeader: 'Agreement generated',
        documents: [],
        deliveryDestinations: [
          {
            id: 'dest-1',
            type: 'email',
            name: 'Client Email',
            enabled: true,
            config: { to: 'client@example.com' },
          },
          {
            id: 'dest-2',
            type: 'webhook',
            name: 'Webhook with secret',
            enabled: true,
            config: {
              url: 'https://api.example.com/webhook',
              secret: 'my-super-secret',
              headers: { Authorization: 'Bearer header-secret' },
            },
          },
          {
            id: 'dest-3',
            type: 'webhook',
            name: 'Internal Hook',
            enabled: false,
            config: { url: 'https://api.internal/hook' },
          },
        ],
      };

      const result = await service.enqueueDeliveriesForRun('33333333-3333-3333-3333-333333333333', finalConfig);

      expect(result).toHaveLength(2);
      expect(runDocumentDeliveryRepository.createDeliveries).toHaveBeenCalledTimes(1);

      const createdDeliveries = vi.mocked(runDocumentDeliveryRepository.createDeliveries).mock.calls[0]?.[0];
      expect(createdDeliveries).toBeDefined();
      expect(createdDeliveries?.[0]).toMatchObject({
        runId: '33333333-3333-3333-3333-333333333333',
        workflowId: '44444444-4444-4444-4444-444444444444',
        tenantId: '11111111-1111-1111-1111-111111111111',
        destinationType: 'email',
        status: 'pending',
        attempts: 0,
      });

      expect(createdDeliveries?.[1]?.destinationType).toBe('webhook');
      const webhookConfig = createdDeliveries?.[1]?.destinationConfig as Record<string, unknown> | undefined;
      expect(webhookConfig?.url).toBe('https://api.example.com/webhook');
      const encryptedSecret = typeof webhookConfig?.secret === 'string' ? webhookConfig.secret : '';
      expect(encryptedSecret).not.toBe('my-super-secret');
      expect(decrypt(encryptedSecret)).toBe('my-super-secret');
      const encryptedAuthorization = (webhookConfig?.headers as Record<string, string>).Authorization;
      expect(decrypt(encryptedAuthorization)).toBe('Bearer header-secret');
    });

    it('should handle user-owned workflows without throwing FK / tenant error', async () => {
      const userOwnedRun = {
        ...mockRun,
        ownerType: 'user',
        ownerUuid: 'user-owner-2',
        createdBy: 'creator:user-owner-2',
      } as unknown as WorkflowRun;

      const userOwnedWorkflow = {
        ...mockWorkflow,
        ownerType: 'user',
        ownerUuid: 'user-owner-2',
        creatorId: null,
        projectId: null,
      } as unknown as Workflow;

      vi.mocked(workflowRunRepository.findById).mockResolvedValue(userOwnedRun);
      vi.mocked(workflowRepository.findById).mockResolvedValue(userOwnedWorkflow);
      vi.mocked(userRepository.findById).mockResolvedValue({
        id: 'user-owner-2',
        tenantId: '22222222-2222-2222-2222-222222222222',
      } as never);
      vi.mocked(runDocumentDeliveryRepository.createDeliveries).mockImplementation(
        async (records) => records as unknown as RunDocumentDelivery[]
      );

      const finalConfig: FinalBlockConfig = {
        markdownHeader: 'Agreement generated',
        documents: [],
        deliveryDestinations: [
          {
            id: 'dest-1',
            type: 'email',
            name: 'Client Email',
            enabled: true,
            config: { to: 'client@example.com' },
          },
        ],
      };

      const result = await service.enqueueDeliveriesForRun('33333333-3333-3333-3333-333333333333', finalConfig);
      expect(result).toHaveLength(1);
      expect(runDocumentDeliveryRepository.createDeliveries).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            runId: '33333333-3333-3333-3333-333333333333',
            tenantId: '22222222-2222-2222-2222-222222222222',
          }),
        ],
        undefined
      );
    });

    it('should resolve organization-owned runs through the organization tenant', async () => {
      vi.mocked(workflowRunRepository.findById).mockResolvedValue({
        ...mockRun,
        ownerType: 'org',
        ownerUuid: '33333333-3333-3333-3333-333333333333',
      } as unknown as WorkflowRun);
      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow);
      vi.mocked(organizationRepository.findById).mockResolvedValue({
        id: '33333333-3333-3333-3333-333333333333',
        tenantId: '22222222-2222-2222-2222-222222222222',
      } as never);
      vi.mocked(runDocumentDeliveryRepository.createDeliveries).mockImplementation(
        async (records) => records as unknown as RunDocumentDelivery[]
      );

      await service.enqueueDeliveriesForRun(mockRun.id, {
        markdownHeader: '',
        documents: [],
        deliveryDestinations: [{
          id: 'dest-org',
          type: 'email',
          config: { to: 'org@example.com' },
        }],
      });

      expect(runDocumentDeliveryRepository.createDeliveries).toHaveBeenCalledWith(
        [expect.objectContaining({ tenantId: '22222222-2222-2222-2222-222222222222' })],
        undefined
      );
    });

    it('should throw instead of inserting an orphan when no tenant resolves', async () => {
      // Unowned run and unfiled, unowned workflow: every resolveTenantId branch
      // comes up empty. A null tenant_id row would be delivered by the worker
      // but invisible and un-retryable through the tenant-scoped API.
      vi.mocked(workflowRunRepository.findById).mockResolvedValue({
        ...mockRun,
        ownerType: null,
        ownerUuid: null,
        createdBy: 'anon',
      } as unknown as WorkflowRun);
      vi.mocked(workflowRepository.findById).mockResolvedValue({
        ...mockWorkflow,
        ownerType: null,
        ownerUuid: null,
      } as unknown as Workflow);

      await expect(
        service.enqueueDeliveriesForRun(mockRun.id, {
          markdownHeader: '',
          documents: [],
          deliveryDestinations: [{
            id: 'dest-orphan',
            type: 'email',
            config: { to: 'nobody@example.com' },
          }],
        })
      ).rejects.toThrow(/no tenant could be resolved/);

      expect(runDocumentDeliveryRepository.createDeliveries).not.toHaveBeenCalled();
    });

    it('should return empty array if no destinations configured', async () => {
      const finalConfig: FinalBlockConfig = {
        markdownHeader: '',
        documents: [],
        deliveryDestinations: [],
      };

      const result = await service.enqueueDeliveriesForRun('33333333-3333-3333-3333-333333333333', finalConfig);
      expect(result).toEqual([]);
      expect(runDocumentDeliveryRepository.createDeliveries).not.toHaveBeenCalled();
    });
  });

  describe('calculateBackoff()', () => {
    it('should exponentially increase retry delay', () => {
      const delay0 = service.calculateBackoff(0);
      const delay1 = service.calculateBackoff(1);
      const delay2 = service.calculateBackoff(2);

      expect(delay0).toBeGreaterThanOrEqual(5000);
      expect(delay1).toBeGreaterThanOrEqual(10000);
      expect(delay2).toBeGreaterThanOrEqual(20000);
    });
  });

  describe('processDelivery()', () => {
    it('should call email delivery adapter and mark delivered on success', async () => {
      vi.mocked(workflowRunRepository.findById).mockResolvedValue(mockRun);
      vi.mocked(runGeneratedDocumentsRepository.findByRunId).mockResolvedValue([]);
      vi.mocked(runDataService.buildForRun).mockResolvedValue({
        byStepId: {},
        byAlias: {},
        steps: [],
      });
      vi.mocked(emailDeliveryAdapter.deliver).mockResolvedValue({
        success: true,
        durationMs: 150,
        metadata: { jobId: 'job-1' },
      });
      vi.mocked(runDocumentDeliveryRepository.markDelivered).mockImplementation(
        async (_id, audit) =>
          ({
            id: 'delivery-1',
            status: 'delivered',
            auditLog: [audit],
          }) as unknown as RunDocumentDelivery
      );

      const delivery: RunDocumentDelivery = {
        id: 'delivery-1',
        runId: '33333333-3333-3333-3333-333333333333',
        workflowId: '44444444-4444-4444-4444-444444444444',
        tenantId: '11111111-1111-1111-1111-111111111111',
        destinationType: 'email',
        destinationConfig: { to: 'test@example.com' },
        status: 'processing',
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        lastAttemptAt: null,
        deliveredAt: null,
        lastError: null,
        auditLog: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.processDelivery(delivery);

      expect(emailDeliveryAdapter.deliver).toHaveBeenCalled();
      expect(runDocumentDeliveryRepository.markDelivered).toHaveBeenCalledWith(
        'delivery-1',
        expect.objectContaining({
          status: 'delivered',
          attempt: 1,
        })
      );
      expect(result.status).toBe('delivered');
    });

    it('should schedule retry when adapter delivery fails', async () => {
      vi.mocked(workflowRunRepository.findById).mockResolvedValue(mockRun);
      vi.mocked(runGeneratedDocumentsRepository.findByRunId).mockResolvedValue([]);
      vi.mocked(runDataService.buildForRun).mockResolvedValue({
        byStepId: {},
        byAlias: {},
        steps: [],
      });
      vi.mocked(webhookDeliveryAdapter.deliver).mockResolvedValue({
        success: false,
        durationMs: 300,
        error: 'Network Timeout',
      });
      vi.mocked(runDocumentDeliveryRepository.markRetryOrFailed).mockImplementation(
        async (_id, options) =>
          ({
            id: 'delivery-2',
            status: 'retry',
            lastError: options.error,
            nextAttemptAt: options.nextAttemptAt ?? new Date(),
            auditLog: [options.auditEntry],
          }) as unknown as RunDocumentDelivery
      );

      const delivery: RunDocumentDelivery = {
        id: 'delivery-2',
        runId: '33333333-3333-3333-3333-333333333333',
        workflowId: '44444444-4444-4444-4444-444444444444',
        tenantId: '11111111-1111-1111-1111-111111111111',
        destinationType: 'webhook',
        destinationConfig: { url: 'https://example.com/hook' },
        status: 'processing',
        attempts: 1,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        lastAttemptAt: null,
        deliveredAt: null,
        lastError: null,
        auditLog: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.processDelivery(delivery);

      expect(webhookDeliveryAdapter.deliver).toHaveBeenCalled();
      const calls = vi.mocked(runDocumentDeliveryRepository.markRetryOrFailed).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe('delivery-2');
      expect(calls[0][1].error).toBe('Network Timeout');
      expect(calls[0][1].isFinalFailure).toBe(false);
      expect(calls[0][1].auditEntry.status).toBe('retry');
      expect(calls[0][1].auditEntry.attempt).toBe(2);
      expect(result.status).toBe('retry');
    });

    it('should mark as final failure when max attempts reached', async () => {
      vi.mocked(workflowRunRepository.findById).mockResolvedValue(mockRun);
      vi.mocked(runGeneratedDocumentsRepository.findByRunId).mockResolvedValue([]);
      vi.mocked(runDataService.buildForRun).mockResolvedValue({
        byStepId: {},
        byAlias: {},
        steps: [],
      });
      vi.mocked(cloudStorageDeliveryAdapter.deliver).mockResolvedValue({
        success: false,
        durationMs: 50,
        error: 'Access Denied to S3 bucket',
      });
      vi.mocked(runDocumentDeliveryRepository.markRetryOrFailed).mockImplementation(
        async (_id, options) =>
          ({
            id: 'delivery-3',
            status: 'failed',
            lastError: options.error,
            auditLog: [options.auditEntry],
          }) as unknown as RunDocumentDelivery
      );

      const delivery: RunDocumentDelivery = {
        id: 'delivery-3',
        runId: '33333333-3333-3333-3333-333333333333',
        workflowId: '44444444-4444-4444-4444-444444444444',
        tenantId: '11111111-1111-1111-1111-111111111111',
        destinationType: 'cloud_storage',
        destinationConfig: { bucket: 'my-bucket' },
        status: 'processing',
        attempts: 4, // 5th attempt will be final
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        lastAttemptAt: null,
        deliveredAt: null,
        lastError: null,
        auditLog: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.processDelivery(delivery);

      expect(cloudStorageDeliveryAdapter.deliver).toHaveBeenCalled();
      const calls = vi.mocked(runDocumentDeliveryRepository.markRetryOrFailed).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe('delivery-3');
      expect(calls[0][1].error).toBe('Access Denied to S3 bucket');
      expect(calls[0][1].isFinalFailure).toBe(true);
      expect(calls[0][1].auditEntry.status).toBe('failed');
      expect(calls[0][1].auditEntry.attempt).toBe(5);
      expect(result.status).toBe('failed');
    });
  });

  describe('processPendingDeliveries()', () => {
    it('should claim batch and process all claimed items', async () => {
      const mockBatch: RunDocumentDelivery[] = [
        {
          id: 'delivery-1',
          runId: '33333333-3333-3333-3333-333333333333',
          workflowId: '44444444-4444-4444-4444-444444444444',
          tenantId: '11111111-1111-1111-1111-111111111111',
          destinationType: 'email',
          destinationConfig: { to: 'user@example.com' },
          status: 'processing',
          attempts: 0,
          maxAttempts: 5,
          nextAttemptAt: new Date(),
          lastAttemptAt: null,
          deliveredAt: null,
          lastError: null,
          auditLog: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(runDocumentDeliveryRepository.claimBatch).mockResolvedValue(mockBatch);
      vi.spyOn(service, 'processDelivery').mockResolvedValue(mockBatch[0]);

      const count = await service.processPendingDeliveries();

      expect(count).toBe(1);
      expect(runDocumentDeliveryRepository.claimBatch).toHaveBeenCalled();
      expect(service.processDelivery).toHaveBeenCalledWith(mockBatch[0]);
    });
  });

  describe('tenant-scoped queries', () => {
    it('lists only after the run resolves to the requested tenant', async () => {
      vi.mocked(workflowRunRepository.findById).mockResolvedValue(mockRun);
      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow);
      vi.mocked(runDocumentDeliveryRepository.findByRunIdAndTenantId).mockResolvedValue([]);

      const result = await service.listDeliveriesForRun(
        mockRun.id,
        '11111111-1111-1111-1111-111111111111'
      );

      expect(result).toEqual([]);
      expect(runDocumentDeliveryRepository.findByRunIdAndTenantId).toHaveBeenCalledWith(
        mockRun.id,
        '11111111-1111-1111-1111-111111111111',
        expect.anything()
      );
    });

    it('denies a run whose resolved tenant differs before querying deliveries', async () => {
      vi.mocked(workflowRunRepository.findById).mockResolvedValue(mockRun);
      vi.mocked(workflowRepository.findById).mockResolvedValue(mockWorkflow);

      await expect(service.listDeliveriesForRun(
        mockRun.id,
        '22222222-2222-2222-2222-222222222222'
      )).rejects.toThrow('Access denied');
      expect(runDocumentDeliveryRepository.findByRunIdAndTenantId).not.toHaveBeenCalled();
    });

    it('loads a delivery through the tenant-scoped repository query', async () => {
      const delivery = { id: 'delivery-tenant', tenantId: 'tenant-1' } as RunDocumentDelivery;
      vi.mocked(runDocumentDeliveryRepository.findByIdAndTenantId).mockResolvedValue(delivery);

      await expect(service.getDeliveryForTenant('delivery-tenant', 'tenant-1'))
        .resolves.toBe(delivery);
      expect(runDocumentDeliveryRepository.findByIdAndTenantId).toHaveBeenCalledWith(
        'delivery-tenant',
        'tenant-1',
        expect.anything()
      );
    });
  });

  describe('sanitizeDeliveryForResponse()', () => {
    it('should redact secret and secretAccessKey from response', () => {
      const mockDelivery = {
        id: 'delivery-1',
        destinationConfig: {
          url: 'https://example.com/webhook',
          secret: 'cipher123',
          secretAccessKey: 's3secret',
          accessKeyId: 'AKIA1234567890',
          headers: { Authorization: 'v1.encrypted' },
        },
      } as unknown as RunDocumentDelivery;

      const sanitized = sanitizeDeliveryForResponse(mockDelivery);
      const cfg = sanitized.destinationConfig as Record<string, unknown>;
      expect(cfg.secret).toBeUndefined();
      expect(cfg.secretAccessKey).toBeUndefined();
      expect(cfg.accessKeyId).toBeUndefined();
      expect(cfg.headers).toEqual({ Authorization: '••••••••' });
    });
  });
});
