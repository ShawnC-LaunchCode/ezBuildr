// @vitest-environment jsdom
/**
 * SECT-8B — keeping the rail's reached set current without a refetch.
 *
 * `next` deliberately does not invalidate the runtime query (refetching races
 * `setCurrentPageIndex`), but the rail still has to see the run's reached set
 * grow as the respondent advances. The server appended the destination *it*
 * resolved and returns that id, so the cached runtime is patched with exactly
 * that value — the client never decides which page was reached.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  next: vi.fn(),
}));

vi.mock('../../../client/src/lib/vault-api', () => ({
  runAPI: { next: mocks.next },
}));

import { useNext } from '../../../client/src/hooks/api/useRuns';
import { queryKeys } from '../../../client/src/hooks/api/queryKeys';

const RUN_ID = 'run-1';

function seedRuntime(client: QueryClient, visitedPageIds: string[]): void {
  client.setQueryData(queryKeys.runRuntime(RUN_ID), {
    contractVersion: 1,
    run: { id: RUN_ID, currentPageId: 'p-one', visitedPageIds },
  });
}

function cachedVisited(client: QueryClient): string[] {
  const runtime = client.getQueryData<{ run: { visitedPageIds: string[] } }>(
    queryKeys.runRuntime(RUN_ID)
  );
  return runtime?.run.visitedPageIds ?? [];
}

function renderNext(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useNext(), { wrapper });
}

afterEach(() => {
  mocks.next.mockReset();
});

describe('useNext keeps the cached reached set in step with the server', () => {
  it('appends the server-resolved destination, not the page the client sent', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedRuntime(client, ['p-one']);
    // The server skipped over p-two and resolved to p-three.
    mocks.next.mockResolvedValue({ nextPageId: 'p-three' });

    const { result } = renderNext(client);
    await result.current.mutateAsync({ runId: RUN_ID, currentPageId: 'p-one' });

    await waitFor(() => {
      expect(cachedVisited(client)).toEqual(['p-one', 'p-three']);
    });
  });

  it('never duplicates an id already in the array', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedRuntime(client, ['p-one', 'p-two']);
    mocks.next.mockResolvedValue({ nextPageId: 'p-two' });

    const { result } = renderNext(client);
    await result.current.mutateAsync({ runId: RUN_ID, currentPageId: 'p-one' });

    await waitFor(() => {
      expect(cachedVisited(client)).toEqual(['p-one', 'p-two']);
    });
  });

  it('leaves the array alone when the server resolved no next page', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    seedRuntime(client, ['p-one']);
    mocks.next.mockResolvedValue({});

    const { result } = renderNext(client);
    await result.current.mutateAsync({ runId: RUN_ID, currentPageId: 'p-one' });

    expect(cachedVisited(client)).toEqual(['p-one']);
  });
});
