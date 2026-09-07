// @vitest-environment jsdom
/**
 * CB-9a-3a: a preview id is a SESSION, not something to resolve.
 *
 * Under the historical `'resolve'` path a preview run — which deliberately
 * carries no run token (9a-1) — falls through every branch of
 * `resolveUuidRunSession` to `startReplacementRunFromExistingRunId`, which
 * reads the run's `workflowId`, starts a brand new ORDINARY LIVE run, and
 * reports "New session started". That path is shared with every respondent
 * returning to an abandoned run, so it is left exactly as it was; the fix is a
 * new mode that opts out of resolution entirely.
 *
 * The assertions below are deliberately about *whether resolution is
 * attempted*, not about what the fork returns. The fork's internals are live
 * respondent recovery and are not this ticket's contract — asserting them here
 * would couple a preview test to four branches it does not own.
 *
 * The `advance` request/response contract is proven over real HTTP against a
 * real database in `tests/integration/preview.execution.test.ts`; re-asserting
 * its shape against a mocked fetch here would test the mock.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchAPIMock, startRunFromWorkflowIdMock, startRunFromSlugMock,
  setRunTokenMock, getRunTokenMock, useRunRuntimeMock,
} = vi.hoisted(() => ({
  fetchAPIMock: vi.fn(),
  startRunFromWorkflowIdMock: vi.fn(),
  startRunFromSlugMock: vi.fn(),
  setRunTokenMock: vi.fn(),
  getRunTokenMock: vi.fn(),
  useRunRuntimeMock: vi.fn(),
}));

vi.mock('@/lib/vault-api', () => ({ fetchAPI: fetchAPIMock }));
vi.mock('@/lib/vault-hooks', () => ({ useRunRuntime: useRunRuntimeMock }));
vi.mock('@/lib/runTokens', () => ({ getRunToken: getRunTokenMock, setRunToken: setRunTokenMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/pages/workflow-runner/runner.utils', () => ({
  isUUID: (value: string) => /^[0-9a-f]{8}-/i.test(value),
  startRunFromWorkflowId: startRunFromWorkflowIdMock,
  startRunFromSlug: startRunFromSlugMock,
}));
vi.mock('@/lib/previewRunner/usePreviewEnvironment', () => ({ usePreviewEnvironment: () => null }));

const PREVIEW_RUN_ID = '11111111-2222-3333-4444-555555555555';

describe('CB-9a-3a preview session plumbing', () => {
  beforeEach(() => {
    getRunTokenMock.mockReturnValue(null);
    useRunRuntimeMock.mockReturnValue({ data: undefined, error: null, isLoading: false });
    fetchAPIMock.mockResolvedValue({ data: { workflowId: 'workflow-1' } });
    startRunFromWorkflowIdMock.mockResolvedValue({ runId: 'a-brand-new-live-run', runToken: 'tok' });
    startRunFromSlugMock.mockResolvedValue({ runId: 'a-slug-run', runToken: 'tok' });
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("uses a 'session' id verbatim and never attempts to resolve it", async () => {
    const { useRunSession } = await import('../../../client/src/hooks/runner/useRunSession');
    const { result } = renderHook(() => useRunSession(PREVIEW_RUN_ID, undefined, 'session'));

    await waitFor(() => { expect(result.current.isInitializing).toBe(false); });
    expect(result.current.actualRunId).toBe(PREVIEW_RUN_ID);
    expect(result.current.initError).toBeNull();
    // The whole point. Any of these firing is the preview session being
    // replaced by an ordinary live run behind the author's back.
    expect(startRunFromWorkflowIdMock).not.toHaveBeenCalled();
    expect(startRunFromSlugMock).not.toHaveBeenCalled();
    expect(fetchAPIMock).not.toHaveBeenCalled();
    expect(setRunTokenMock).not.toHaveBeenCalled();
  });

  it("still resolves under 'resolve', so live recovery is untouched", async () => {
    const { useRunSession } = await import('../../../client/src/hooks/runner/useRunSession');
    const { result } = renderHook(() => useRunSession(PREVIEW_RUN_ID, undefined, 'resolve'));

    await waitFor(() => { expect(result.current.isInitializing).toBe(false); });
    // Resolution was attempted and its result adopted — the historical path.
    expect(startRunFromWorkflowIdMock).toHaveBeenCalledWith(PREVIEW_RUN_ID, undefined);
    expect(result.current.actualRunId).toBe('a-brand-new-live-run');
    expect(result.current.actualRunId).not.toBe(PREVIEW_RUN_ID);
  });

  it("defaults to 'resolve', so no existing caller changes behaviour", async () => {
    const { useRunSession } = await import('../../../client/src/hooks/runner/useRunSession');
    const { result } = renderHook(() => useRunSession(PREVIEW_RUN_ID));

    await waitFor(() => { expect(result.current.isInitializing).toBe(false); });
    expect(startRunFromWorkflowIdMock).toHaveBeenCalled();
    expect(setRunTokenMock).toHaveBeenCalledWith('a-brand-new-live-run', 'tok');
  });

  it('honours a stored run token without resolving, in either mode', async () => {
    getRunTokenMock.mockReturnValue('existing-token');
    const { useRunSession } = await import('../../../client/src/hooks/runner/useRunSession');
    const { result } = renderHook(() => useRunSession(PREVIEW_RUN_ID));

    await waitFor(() => { expect(result.current.isInitializing).toBe(false); });
    expect(result.current.actualRunId).toBe(PREVIEW_RUN_ID);
    expect(startRunFromWorkflowIdMock).not.toHaveBeenCalled();
  });

  it('reports a missing id rather than silently idling', async () => {
    const { useRunSession } = await import('../../../client/src/hooks/runner/useRunSession');
    const { result } = renderHook(() => useRunSession(undefined, undefined, 'session'));

    await waitFor(() => { expect(result.current.isInitializing).toBe(false); });
    expect(result.current.initError).toBe('No run ID provided');
    expect(result.current.actualRunId).toBeNull();
  });
});
