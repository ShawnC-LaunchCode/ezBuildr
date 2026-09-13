import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

// RLS-5: `readInspector` opens its ownership read via `withCurrentTenant`
// (server/utils/rlsContext.ts), which calls the real `db.transaction`. `db`
// must be mocked or the chain throws "Database not initialized" — same
// pattern as tests/unit/services/RunDefinitionProvider.test.ts.
vi.mock('../../../server/db', () => {
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

import { CodeBlockService } from '../../../server/services/codeBlocks/CodeBlockService';
import type { WorkflowRun } from '@shared/schema';

const runId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const workflowId = '33333333-3333-4333-8333-333333333333';
const ownTenantId = '44444444-4444-4444-8444-444444444444';

function makeRun(): WorkflowRun {
  return { id: runId, workflowId } as unknown as WorkflowRun;
}

/**
 * CB-B8: `readInspector`'s own tenant and access-verification checks are
 * defence in depth on top of RLS (tests/integration/codeBlocks.inspector.test.ts
 * proves the cross-tenant case end to end, where RLS answers first). These
 * unit tests stub the repository directly so each guard is exercised even
 * though nothing at the integration layer would ever reach it.
 */
describe('CodeBlockService.readInspector guards (CB-B8)', () => {
  it('throws when the run belongs to a different tenant, before checking workflow access', async () => {
    const stateRepo = {
      findRunOwnership: vi.fn().mockResolvedValue({ run: makeRun(), tenantId: 'some-other-tenant' }),
    };
    const workflowSvc = { verifyAccess: vi.fn().mockResolvedValue(undefined) };
    const service = new CodeBlockService({
      stateRepo: stateRepo as never,
      workflowSvc: workflowSvc as never,
    });

    await expect(service.readInspector(runId, userId, ownTenantId))
      .rejects.toThrow('Access denied - run belongs to different tenant');
    expect(workflowSvc.verifyAccess).not.toHaveBeenCalled();
  });

  it('throws when verifyAccess rejects, even though the run belongs to the caller\'s tenant', async () => {
    const stateRepo = {
      findRunOwnership: vi.fn().mockResolvedValue({ run: makeRun(), tenantId: ownTenantId }),
    };
    const workflowSvc = {
      verifyAccess: vi.fn().mockRejectedValue(new Error('Access denied - insufficient permissions')),
    };
    const service = new CodeBlockService({
      stateRepo: stateRepo as never,
      workflowSvc: workflowSvc as never,
    });

    await expect(service.readInspector(runId, userId, ownTenantId))
      .rejects.toThrow('Access denied - insufficient permissions');
    expect(workflowSvc.verifyAccess).toHaveBeenCalledWith(workflowId, userId, 'edit', expect.anything());
  });
});
