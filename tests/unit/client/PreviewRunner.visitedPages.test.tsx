// @vitest-environment jsdom
/**
 * SECT-8B (AC9), updated by CB-9a-3b — preview has a persisted run row.
 * Reached pages come from that run's runtime, exactly as for production.
 * The shared advance response updates its cached reached set; the preview
 * shell owns only session lifetime. Reset replaces the run rather than
 * clearing an independent in-memory navigation set.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAdvance, useRunRuntime } from '../../../client/src/hooks/api/useRuns';
import { useServerPreviewSession } from '../../../client/src/lib/previewRunner/usePreviewEnvironment';
import type { ApiRunRuntime } from '../../../client/src/lib/vault-api';

const mocks = vi.hoisted(() => ({ fetchAPI: vi.fn(), getRuntime: vi.fn(), advance: vi.fn() }));
vi.mock('../../../client/src/lib/vault-api', async () => ({
  ...await vi.importActual<Record<string, unknown>>('../../../client/src/lib/vault-api'),
  fetchAPI: mocks.fetchAPI,
  runAPI: { getRuntime: mocks.getRuntime, advance: mocks.advance },
}));

let client: QueryClient;
let created: number;
function mountSession() {
  return renderHook(() => {
    const session = useServerPreviewSession('workflow-1');
    const runtime = useRunRuntime(session.runId ?? undefined);
    const advance = useAdvance();
    return { session, runtime: runtime.data, advance };
  }, { wrapper: ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
beforeEach(() => {
  vi.clearAllMocks();
  created = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  mocks.fetchAPI.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { return Promise.resolve({ runId: `preview-${++created}` }); }
    return Promise.resolve(init?.method === 'DELETE' ? undefined : { runId: url.split('/').at(-1) });
  });
  mocks.getRuntime.mockImplementation((runId: string) => Promise.resolve({
    run: { id: runId, currentPageId: 'p-one', visitedPageIds: ['p-one'] }, values: [],
  }));
});
afterEach(() => { cleanup(); client.clear(); });

function visited(runtime: ApiRunRuntime | undefined): string[] | undefined {
  return runtime?.run.visitedPageIds;
}

describe('preview reached set from the server run (AC9)', () => {
  it('hydrates persisted entries in order and adds only the server-resolved destination', async () => {
    // An already-reached page in the run row must survive initial hydration.
    mocks.getRuntime.mockResolvedValue({ run: { id: 'preview-1', currentPageId: 'p-one', visitedPageIds: ['p-earlier', 'p-one'] }, values: [] });
    const { result } = mountSession();
    await waitFor(() => { expect(visited(result.current.runtime)).toEqual(['p-earlier', 'p-one']); });
    mocks.advance.mockResolvedValue({ submissionKey: 'one', success: true, navigation: { nextPageId: 'p-three' } });
    await act(async () => { await result.current.advance.mutateAsync({ runId: 'preview-1', pageId: 'p-one', values: [], submissionKey: 'one' }); });
    await waitFor(() => { expect(visited(result.current.runtime)).toEqual(['p-earlier', 'p-one', 'p-three']); });
    expect(visited(result.current.runtime)).not.toContain('p-two');
    expect(mocks.getRuntime).toHaveBeenCalledWith('preview-1');
  });

  it('never duplicates a reached page when navigation returns to it', async () => {
    const { result } = mountSession();
    await waitFor(() => { expect(visited(result.current.runtime)).toEqual(['p-one']); });
    mocks.advance.mockResolvedValueOnce({ submissionKey: 'one', success: true, navigation: { nextPageId: 'p-two' } })
      .mockResolvedValueOnce({ submissionKey: 'two', success: true, navigation: { nextPageId: 'p-one' } });
    await act(async () => { await result.current.advance.mutateAsync({ runId: 'preview-1', pageId: 'p-one', values: [], submissionKey: 'one' }); });
    await act(async () => { await result.current.advance.mutateAsync({ runId: 'preview-1', pageId: 'p-two', values: [], submissionKey: 'two' }); });
    await waitFor(() => { expect(visited(result.current.runtime)).toEqual(['p-one', 'p-two']); });
  });

  it('ignores a response whose submission key is not the one that was sent', async () => {
    // Reviewer-added. `useAdvance.onSuccess` guards its cache write with a
    // submissionKey identity check, and deleting that guard left every other
    // test green — an untested guard is one somebody later removes as dead
    // code. Defence-in-depth rather than a reachable bug: HTTP pairing returns
    // the key that was asked for, and the replay path returns the stored one.
    //
    // The foreign response is followed by a MATCHING one, and the final set is
    // asserted whole. A bare "did not appear" check right after the act passes
    // whether the guard exists or not, because the cache write it is meant to
    // catch has not been flushed yet — it asserts nothing.
    const { result } = mountSession();
    await waitFor(() => { expect(visited(result.current.runtime)).toEqual(['p-one']); });
    mocks.advance
      .mockResolvedValueOnce({ submissionKey: 'a-superseded-submission', success: true, navigation: { nextPageId: 'p-foreign' } })
      .mockResolvedValueOnce({ submissionKey: 'the-one-we-sent', success: true, navigation: { nextPageId: 'p-two' } });
    await act(async () => { await result.current.advance.mutateAsync({ runId: 'preview-1', pageId: 'p-one', values: [], submissionKey: 'the-one-we-sent' }); });
    await act(async () => { await result.current.advance.mutateAsync({ runId: 'preview-1', pageId: 'p-one', values: [], submissionKey: 'the-one-we-sent' }); });
    await waitFor(() => { expect(visited(result.current.runtime)).toEqual(['p-one', 'p-two']); });
    expect(visited(result.current.runtime)).not.toContain('p-foreign');
  });

  it('retires the old run and reads the replacement run reached set on reset', async () => {
    const { result } = mountSession();
    await waitFor(() => { expect(visited(result.current.runtime)).toEqual(['p-one']); });
    mocks.advance.mockResolvedValue({ submissionKey: 'one', success: true, navigation: { nextPageId: 'p-two' } });
    await act(async () => { await result.current.advance.mutateAsync({ runId: 'preview-1', pageId: 'p-one', values: [], submissionKey: 'one' }); });
    await waitFor(() => { expect(visited(result.current.runtime)).toEqual(['p-one', 'p-two']); });
    await act(async () => { await result.current.session.replace(); });
    await waitFor(() => { expect(result.current.runtime?.run.id).toBe('preview-2'); });
    expect(visited(result.current.runtime)).toEqual(['p-one']);
    expect(mocks.fetchAPI).toHaveBeenCalledWith('/api/preview-runs/preview-1', { method: 'DELETE' });
    expect(mocks.getRuntime).toHaveBeenCalledWith('preview-2');
  });
});
