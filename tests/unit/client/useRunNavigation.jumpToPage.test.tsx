// @vitest-environment jsdom
/**
 * SECT-9 — the guarded jump behind the Section rail and the Review screen's
 * edit buttons.
 *
 * The two things this file exists to prove:
 *
 * 1. **A jump is not a submit.** It flushes pending autosaves exactly as
 *    `handlePrev` does and then moves the view — it never runs `submitPage`
 *    or `next`, which would advance the run and re-resolve `skip_to`.
 * 2. **The guard lives in the hook**, not only in the rail's `disabled`
 *    attribute: `jumpToPage` is called directly here with an unreached id,
 *    the way a rail one render behind the run would call it.
 *
 * Both transport branches are driven. A jump implemented in only one of them
 * is the seam defect this repo keeps paying for, so every production case
 * below has a preview counterpart built from the real `useRunNavigationTransport`.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nextMock, submitPageMock, toastMock } = vi.hoisted(() => ({
  nextMock: vi.fn(),
  submitPageMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('../../../client/src/lib/vault-hooks', () => ({
  useCompleteRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitPage: () => ({ mutateAsync: submitPageMock }),
  useNext: () => ({ mutateAsync: nextMock }),
}));

import {
  useRunNavigation,
  useRunNavigationTransport,
  type RunNavigationTransport,
} from '../../../client/src/hooks/runner/useRunNavigation';
import type { PreviewEnvironment } from '../../../client/src/lib/previewRunner/PreviewEnvironment';
import type { ApiPage } from '../../../client/src/lib/vault-api';

function page(id: string, title: string, order: number): ApiPage {
  return {
    id,
    workflowId: 'workflow-1',
    title,
    description: null,
    order,
    createdAt: '2026-08-24T00:00:00.000Z',
  };
}

// Real Property and Bank Accounts are reached; Loans never was.
const PAGES = [
  page('p-real-property', 'Real Property', 0),
  page('p-bank', 'Bank Accounts', 1),
  page('p-loans', 'Loans', 2),
];
const VISITED = ['p-real-property', 'p-bank'];

/** A production transport with an observable, controllable autosave flush. */
function productionTransport(saveNow: () => Promise<void>) {
  return renderHook(() => useRunNavigationTransport({
    mode: 'production',
    previewEnvironment: null,
    getVisiblePageSteps: () => [],
    saveNow,
  })).result.current;
}

function previewTransport(previewEnvironment: Pick<PreviewEnvironment, 'setCurrentPage'>) {
  return renderHook(() => useRunNavigationTransport({
    mode: 'preview',
    previewEnvironment: previewEnvironment as PreviewEnvironment,
    getVisiblePageSteps: () => [],
    saveNow: async () => undefined,
  })).result.current;
}

function renderNavigation(transport: RunNavigationTransport, visitedPageIds = VISITED) {
  return renderHook(() => useRunNavigation({
    actualRunId: 'run-1',
    visiblePages: PAGES,
    effectiveValues: {},
    transport,
    visitedPageIds,
  }));
}

beforeEach(() => {
  submitPageMock.mockReset();
  nextMock.mockReset();
  toastMock.mockReset();
  window.scrollTo = vi.fn();
});

describe('jumpToPage — production (AC1, AC2)', () => {
  it('flushes pending answers before the view moves, and never submits or advances', async () => {
    // A flush the test controls: while it is pending the view must not have
    // moved, which is what "before" in "flush before leaving" actually means.
    let releaseFlush: (() => void) | undefined;
    const saveNow = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
      releaseFlush = resolve;
    }));
    const { result } = renderNavigation(productionTransport(saveNow));

    let jumped: Promise<boolean> | undefined;
    act(() => {
      jumped = result.current.jumpToPage('p-bank');
    });

    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(result.current.currentPageIndex).toBe(0);

    await act(async () => {
      releaseFlush?.();
      await jumped;
    });

    expect(await jumped).toBe(true);
    expect(result.current.currentPageIndex).toBe(1);
    expect(result.current.currentPage?.id).toBe('p-bank');
    expect(submitPageMock).not.toHaveBeenCalled();
    expect(nextMock).not.toHaveBeenCalled();
  });

  it('refuses an unreached page called directly, with no navigation and no flush', async () => {
    const saveNow = vi.fn().mockResolvedValue(undefined);
    const { result } = renderNavigation(productionTransport(saveNow));

    let moved: boolean | undefined;
    await act(async () => {
      moved = await result.current.jumpToPage('p-loans');
    });

    expect(moved).toBe(false);
    expect(result.current.currentPageIndex).toBe(0);
    expect(result.current.currentPage?.id).toBe('p-real-property');
    expect(saveNow).not.toHaveBeenCalled();
    // The same id moves the view once the run has reached it, so the refusal
    // above is the guard firing rather than an id the fixture never had.
    const reached = renderNavigation(productionTransport(saveNow), [...VISITED, 'p-loans']);
    await act(async () => {
      await reached.result.current.jumpToPage('p-loans');
    });
    expect(reached.result.current.currentPage?.id).toBe('p-loans');
  });

  it('refuses a page the visibility engine removed from this run', async () => {
    const saveNow = vi.fn().mockResolvedValue(undefined);
    // Reached earlier, then excluded by a later answer: still not navigable.
    const { result } = renderNavigation(productionTransport(saveNow), [...VISITED, 'p-excluded']);

    let moved: boolean | undefined;
    await act(async () => {
      moved = await result.current.jumpToPage('p-excluded');
    });

    expect(moved).toBe(false);
    expect(result.current.currentPageIndex).toBe(0);
    expect(saveNow).not.toHaveBeenCalled();
  });

  it('treats the row the respondent is already on as a no-op, not a flush', async () => {
    const saveNow = vi.fn().mockResolvedValue(undefined);
    const { result } = renderNavigation(productionTransport(saveNow));

    let moved: boolean | undefined;
    await act(async () => {
      moved = await result.current.jumpToPage('p-real-property');
    });

    expect(moved).toBe(true);
    expect(result.current.currentPageIndex).toBe(0);
    expect(saveNow).not.toHaveBeenCalled();
  });

  it('leaves the Review screen for any visible page, including one skip_to jumped over', async () => {
    // Reaching Review means every visible page is behind the respondent, so an
    // answer on a page `skip_to` skipped stays editable — the pre-SECT-9
    // behavior of the Review edit buttons (AC3).
    const saveNow = vi.fn().mockResolvedValue(undefined);
    const { result } = renderNavigation(productionTransport(saveNow));

    act(() => { result.current.setShowReview(true); });

    let moved: boolean | undefined;
    await act(async () => {
      moved = await result.current.jumpToPage('p-loans');
    });

    expect(moved).toBe(true);
    expect(result.current.showReview).toBe(false);
    expect(result.current.currentPage?.id).toBe('p-loans');
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(submitPageMock).not.toHaveBeenCalled();
    expect(nextMock).not.toHaveBeenCalled();
  });
});

describe('jumpToPage — preview parity (AC4)', () => {
  it('moves the view and keeps the preview cursor in step, without touching production save/submit', async () => {
    const setCurrentPage = vi.fn();
    const { result } = renderNavigation(previewTransport({ setCurrentPage }));

    let moved: boolean | undefined;
    await act(async () => {
      moved = await result.current.jumpToPage('p-bank');
    });

    expect(moved).toBe(true);
    expect(result.current.currentPage?.id).toBe('p-bank');
    // Only the preview branch does this — proof the preview transport, not the
    // production one, carried the jump. The preview cursor feeds the dev
    // toolbar's per-page tools, so a jump that left it stale would fill the
    // page the respondent just left.
    expect(setCurrentPage).toHaveBeenCalledWith(1);
    expect(submitPageMock).not.toHaveBeenCalled();
    expect(nextMock).not.toHaveBeenCalled();
  });

  it('applies the same reached guard in preview', async () => {
    const setCurrentPage = vi.fn();
    const { result } = renderNavigation(previewTransport({ setCurrentPage }));

    let moved: boolean | undefined;
    await act(async () => {
      moved = await result.current.jumpToPage('p-loans');
    });

    expect(moved).toBe(false);
    expect(result.current.currentPage?.id).toBe('p-real-property');
    expect(setCurrentPage).not.toHaveBeenCalled();
  });
});
