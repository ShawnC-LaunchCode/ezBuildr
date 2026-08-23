/**
 * RunMetricsService — analytics event guard for versionless runs (RUN2-19).
 *
 * `workflow_run_events.version_id` is a NOT NULL uuid column with a foreign
 * key to `workflow_versions` (shared/schema/run.ts). The service used to pass
 * the literal string 'draft' when a run had no pinned version, which fails
 * `invalid input syntax for type uuid: "draft"` at insert time and is
 * swallowed by the surrounding try/catch. These tests assert the fix: the
 * event is skipped (not attempted) for versionless runs, and unchanged for
 * runs with a real version.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

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
vi.mock('../../../server/utils/rlsContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/utils/rlsContext')>();
  return {
    ...actual,
    withCurrentTenant: <T,>(fn: (tx: unknown) => Promise<T>) => fn(undefined),
    withTenant: <T,>(_tenantId: string, fn: (tx: unknown) => Promise<T>) => fn(undefined),
    withVerifiedIdentifier: <T,>(_guc: string, _value: string, fn: (tx: unknown) => Promise<T>) => fn(undefined),
  };
});

// `getWorkflowContext` resolves the tenant through the shared
// `WorkflowTenantResolver` singleton (RLS-5) rather than deriving it locally.
// That singleton is not injected like the two repositories below, so without
// this it reaches the real pool.
vi.mock('../../../server/services/WorkflowTenantResolver', () => ({
  workflowTenantResolver: { resolveForWorkflowId: vi.fn().mockResolvedValue('tenant-1') },
}));

vi.mock('../../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const { recordEventMock } = vi.hoisted(() => ({
  recordEventMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../server/services/analytics/AnalyticsService', () => ({
  analyticsService: { recordEvent: recordEventMock },
}));

vi.mock('../../../server/services/analytics/AggregationService', () => ({
  aggregationService: { aggregateRun: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../server/services/metrics', () => ({
  captureRunLifecycle: {
    started: vi.fn().mockResolvedValue(undefined),
    succeeded: vi.fn().mockResolvedValue(undefined),
    failed: vi.fn().mockResolvedValue(undefined),
  },
}));

import { logger } from '../../../server/logger';
import { RunMetricsService } from '../../../server/services/workflow-runs/RunMetricsService';

const workflowId = 'wf-1';
const runId = 'run-1';
const realVersionId = '33333333-3333-4333-8333-333333333333';

function makeService() {
  const workflowRepo = { findById: vi.fn().mockResolvedValue({ id: workflowId, projectId: 'proj-1' }) };
  const projectRepo = { findById: vi.fn().mockResolvedValue({ id: 'proj-1', tenantId: 'tenant-1' }) };
  return new RunMetricsService(workflowRepo as never, projectRepo as never);
}

describe('RunMetricsService — versionless run analytics guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC1 — no workflowVersionId', () => {
    it('captureRunStarted records no analytics event and logs no error', async () => {
      const service = makeService();

      await service.captureRunStarted(workflowId, runId, 'user-1', undefined);

      expect(recordEventMock).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ runId, type: 'run.start' }),
        'Skipping analytics event for versionless run'
      );
    });

    it('captureRunSucceeded records no analytics event and logs no error', async () => {
      const service = makeService();

      await service.captureRunSucceeded(workflowId, runId, undefined, 1000, 3);

      expect(recordEventMock).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ runId, type: 'workflow.complete' }),
        'Skipping analytics event for versionless run'
      );
    });

    it('captureRunFailed records no analytics event and logs no error', async () => {
      const service = makeService();

      await service.captureRunFailed(workflowId, runId, undefined, 1000, 'validation_error');

      expect(recordEventMock).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ runId, type: 'validation.error' }),
        'Skipping analytics event for versionless run'
      );
    });
  });

  describe('AC2 — real workflowVersionId', () => {
    it('captureRunStarted still records its event unchanged', async () => {
      const service = makeService();

      await service.captureRunStarted(workflowId, runId, 'user-1', realVersionId);

      expect(recordEventMock).toHaveBeenCalledTimes(1);
      expect(recordEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ runId, workflowId, versionId: realVersionId, type: 'run.start' })
      );
    });

    it('captureRunSucceeded still records its event unchanged', async () => {
      const service = makeService();

      await service.captureRunSucceeded(workflowId, runId, realVersionId, 1000, 3);

      expect(recordEventMock).toHaveBeenCalledTimes(1);
      expect(recordEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ runId, workflowId, versionId: realVersionId, type: 'workflow.complete' })
      );
    });

    it('captureRunFailed still records its event unchanged', async () => {
      const service = makeService();

      await service.captureRunFailed(workflowId, runId, realVersionId, 1000, 'validation_error');

      expect(recordEventMock).toHaveBeenCalledTimes(1);
      expect(recordEventMock).toHaveBeenCalledWith(
        expect.objectContaining({ runId, workflowId, versionId: realVersionId, type: 'validation.error' })
      );
    });
  });
});
