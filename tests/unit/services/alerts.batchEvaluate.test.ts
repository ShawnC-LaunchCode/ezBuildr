/**
 * RLS-8: the alert batch must evaluate each project INSIDE the tenant its row
 * came from.
 *
 * `batchEvaluateAlerts` is a job, so there is no request and no ambient tenant.
 * `evaluateAndAlert` -> `computeSLI` reads `sli_configs` and `metrics_rollups`
 * through `withCurrentTenant`, which under enforcement throws when no tenant is
 * in context — so before this fix every row failed, the batch's own catch
 * logged it, and no alert was ever evaluated in production. The per-tenant scan
 * found the rows (it runs inside `forEachTenant`), but the evaluation loop ran
 * after that transaction closed, with the tenant forgotten.
 *
 * This suite fakes the tenant scan and records which tenant the SLI evaluation
 * actually ran under. Before the fix it recorded `undefined` for every row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { seen } = vi.hoisted(() => ({
  seen: [] as Array<{ projectId: string; tenant: string | undefined }>,
}));

vi.mock('../../../server/services/sli', () => ({
  default: {
    computeSLI: vi.fn(async (params: { projectId: string }) => {
      const { getCurrentTenantId } = await import('../../../server/utils/rlsContext');
      seen.push({ projectId: params.projectId, tenant: getCurrentTenantId() });
      return { violatesTarget: false };
    }),
  },
}));

vi.mock('../../../server/utils/forEachTenant', () => ({
  forEachTenant: vi.fn(async (
    _jobName: string,
    fn: (tenantId: string, tx: unknown) => Promise<unknown>,
  ) => {
    const txReturning = (rows: Array<Record<string, unknown>>) => ({
      execute: vi.fn().mockResolvedValue({ rows }),
    });
    return {
      results: [
        await fn('tenant-a', txReturning([{ project_id: 'project-a1', workflow_id: null }])),
        await fn('tenant-b', txReturning([
          { project_id: 'project-b1', workflow_id: null },
          { project_id: 'project-b2', workflow_id: 'workflow-b2' },
        ])),
      ],
      failures: 0,
    };
  }),
}));

import { batchEvaluateAlerts } from '../../../server/services/alerts';

describe('batchEvaluateAlerts (RLS-8)', () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it('evaluates every row inside the tenant it was read from', async () => {
    await batchEvaluateAlerts();

    expect(seen).toEqual([
      { projectId: 'project-a1', tenant: 'tenant-a' },
      { projectId: 'project-b1', tenant: 'tenant-b' },
      { projectId: 'project-b2', tenant: 'tenant-b' },
    ]);
  });
});
