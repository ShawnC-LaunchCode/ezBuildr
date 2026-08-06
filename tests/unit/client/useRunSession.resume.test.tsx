// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runId = '11111111-1111-4111-8111-111111111111';
const runToken = '22222222-2222-4222-8222-222222222222';
const sectionId = '33333333-3333-4333-8333-333333333333';
const {
  fetchAPIMock,
  setRunTokenMock,
  startRunFromSlugMock,
  startRunFromWorkflowIdMock,
  toastMock,
} = vi.hoisted(() => ({
  fetchAPIMock: vi.fn(),
  setRunTokenMock: vi.fn(),
  startRunFromSlugMock: vi.fn(),
  startRunFromWorkflowIdMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('@/lib/runTokens', () => ({
  getRunToken: vi.fn(() => runToken),
  setRunToken: setRunTokenMock,
}));

vi.mock('@/lib/vault-api', () => ({
  fetchAPI: fetchAPIMock,
}));

vi.mock('@/lib/vault-hooks', () => ({
  useRunRuntime: () => ({
    data: {
      run: {
        id: '11111111-1111-4111-8111-111111111111',
        workflowId: 'workflow-1',
        workflowVersionId: 'version-1',
        currentSectionId: '33333333-3333-4333-8333-333333333333',
        completed: false,
        generationStatus: 'pending',
      },
      values: [{ id: 'value-1', runId: '11111111-1111-4111-8111-111111111111', stepId: 'step-1', value: 'Ada' }],
    },
    error: null,
    isLoading: false,
  }),
}));

vi.mock('@/pages/workflow-runner/runner.utils', () => ({
  isUUID: () => true,
  startRunFromSlug: startRunFromSlugMock,
  startRunFromWorkflowId: startRunFromWorkflowIdMock,
}));

vi.mock('@/lib/previewRunner/usePreviewEnvironment', () => ({
  usePreviewEnvironment: () => null,
}));

import { useRunSession } from '../../../client/src/hooks/runner/useRunSession';

describe('useRunSession resume-link bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', `/run/${runId}?resume=${'a'.repeat(64)}`);
    fetchAPIMock.mockResolvedValue({ data: { runId, runToken } });
  });

  it('redeems the one-time link before loading and restores the runtime state', async () => {
    const { result } = renderHook(() => useRunSession(runId));

    await waitFor(() => { expect(result.current.isInitializing).toBe(false); });

    expect(fetchAPIMock).toHaveBeenCalledWith(`/api/runs/${runId}/resume`, {
      method: 'POST',
      body: JSON.stringify({ token: 'a'.repeat(64) }),
    });
    expect(setRunTokenMock).toHaveBeenCalledWith(runId, runToken);
    expect(window.location.search).toBe('');
    expect(result.current.run).toMatchObject({
      currentSectionId: sectionId,
      values: [expect.objectContaining({ stepId: 'step-1', value: 'Ada' })],
    });
    expect(startRunFromSlugMock).not.toHaveBeenCalled();
    expect(startRunFromWorkflowIdMock).not.toHaveBeenCalled();
  });
});
