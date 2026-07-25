import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchAPIMock } = vi.hoisted(() => ({
  fetchAPIMock: vi.fn(),
}));

vi.mock('../../../client/src/lib/vault-api', () => ({
  fetchAPI: fetchAPIMock,
}));

import { startRunFromSlug, startRunFromWorkflowId } from '../../../client/src/pages/workflow-runner/runner.utils';

describe('startRunFromWorkflowId', () => {
  beforeEach(() => {
    fetchAPIMock.mockReset();
  });

  it('uses the authenticated API client when launching a workflow by UUID', async () => {
    fetchAPIMock.mockResolvedValue({
      data: {
        runId: 'run-1',
        runToken: 'token-1',
        workflowId: 'workflow-1',
      },
    });

    await expect(startRunFromWorkflowId('workflow-1', { name: 'Taylor' })).resolves.toEqual({
      runId: 'run-1',
      runToken: 'token-1',
      workflowId: 'workflow-1',
    });

    expect(fetchAPIMock).toHaveBeenCalledWith('/api/workflows/workflow-1/runs', {
      method: 'POST',
      body: JSON.stringify({ initialValues: { name: 'Taylor' } }),
    });
  });

  it('uses optional authentication when launching a public slug', async () => {
    fetchAPIMock.mockResolvedValue({
      data: {
        runId: 'run-2',
        runToken: 'token-2',
        workflowId: 'workflow-2',
      },
    });

    await expect(startRunFromSlug('client-intake')).resolves.toEqual({
      runId: 'run-2',
      runToken: 'token-2',
      workflowId: 'workflow-2',
    });

    expect(fetchAPIMock).toHaveBeenCalledWith('/api/workflows/public/client-intake/start', {
      method: 'POST',
      body: JSON.stringify({ initialValues: undefined }),
    });
  });
});
