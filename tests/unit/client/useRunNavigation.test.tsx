// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nextMock, submitPageMock, advanceMock, validatePageMock, toastMock } = vi.hoisted(() => ({
  nextMock: vi.fn(),
  submitPageMock: vi.fn(),
  advanceMock: vi.fn(),
  validatePageMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('../../../client/src/lib/vault-hooks', () => ({
  useCompleteRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitPage: () => ({ mutateAsync: submitPageMock }),
  useNext: () => ({ mutateAsync: nextMock }),
  // CB-9a-3a: the production transport now advances in one request.
  useAdvance: () => ({ mutateAsync: advanceMock }),
}));

vi.mock('../../../shared/validation/PageValidator', () => ({
  validatePage: validatePageMock,
}));

vi.mock('../../../shared/validation/BlockValidation', () => ({
  getValidationSchema: () => ({}),
}));

import {
  useRunNavigation,
  useRunNavigationTransport,
  type RunNavigationTransport,
} from '../../../client/src/hooks/runner/useRunNavigation';
import type { ApiAdvanceResult, ApiPage, ApiStep } from '../../../client/src/lib/vault-api';

const page: ApiPage = {
  id: 'page-1',
  workflowId: 'workflow-1',
  title: 'Contact details',
  description: null,
  order: 0,
  createdAt: '2026-07-25T00:00:00.000Z',
};

const phoneStep: ApiStep = {
  id: 'phone-step',
  workflowId: 'workflow-1',
  pageId: page.id,
  type: 'phone',
  title: 'Phone',
  description: null,
  required: true,
  order: 0,
  config: {},
  alias: 'phone',
  visibleIf: null,
  createdAt: '2026-07-25T00:00:00.000Z',
};

describe('useRunNavigation validation state', () => {
  beforeEach(() => {
    validatePageMock.mockReset();
    toastMock.mockReset();
    submitPageMock.mockReset();
    nextMock.mockReset();
    advanceMock.mockReset();
    advanceMock.mockImplementation(({ submissionKey }: { submissionKey: string }) => Promise.resolve(advanceResponse(submissionKey)));
    window.scrollTo = vi.fn();
  });

  it('clears stale field and summary errors when corrected answers validate and advance', async () => {
    validatePageMock
      .mockResolvedValueOnce({
        valid: false,
        blockErrors: { 'phone-step': ['Enter a valid phone number'] },
      })
      .mockResolvedValueOnce({ valid: true, blockErrors: {} });

    const transport: RunNavigationTransport = {
      getVisiblePageSteps: () => [phoneStep],
      saveBeforeLeavingPage: vi.fn().mockResolvedValue(undefined),
      recordViewMovedTo: vi.fn(),
      recordValidationPassed: vi.fn().mockResolvedValue(undefined),
      recordValidationException: vi.fn().mockResolvedValue(undefined),
      advanceAfterValidation: vi.fn().mockResolvedValue(undefined),
    };

    const { result } = renderHook(() =>
      useRunNavigation({
        actualRunId: 'run-1',
        visiblePages: [page],
        effectiveValues: { 'phone-step': '312-555-1212' },
        transport,
      })
    );

    await act(async () => {
      await result.current.handleNext();
    });
    expect(result.current.errors).toEqual(['Enter a valid phone number']);
    expect(result.current.fieldErrors).toEqual({
      'phone-step': ['Enter a valid phone number'],
    });

    await act(async () => {
      await result.current.handleNext();
    });
    expect(result.current.errors).toEqual([]);
    expect(result.current.fieldErrors).toEqual({});
    expect(transport.advanceAfterValidation).toHaveBeenCalledTimes(1);
  });

  it('submits an edited page and returns directly to review without advancing', async () => {
    const setCurrentPageIndex = vi.fn();
    const setShowReview = vi.fn();
    const saveNow = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRunNavigationTransport({
      mode: 'production',
      previewEnvironment: null,
      getVisiblePageSteps: () => [phoneStep],
      saveNow,
    }));

    await act(async () => {
      await result.current.advanceAfterValidation({
        runId: 'run-1',
        currentPage: page,
        currentPageIndex: 0,
        visiblePages: [page],
        visiblePageSteps: [phoneStep],
        effectiveValues: { 'phone-step': '312-555-1212' },
        isLastPage: false,
        setCurrentPageIndex,
        setShowReview,
        returnToReviewAfterValidation: true,
      });
    });

    expect(saveNow).toHaveBeenCalledTimes(1);
    // CB-9a-3a: ONE request per user action, carrying the submission identity
    // that makes a retry a replay rather than a second evaluation.
    expect(advanceMock).toHaveBeenCalledTimes(1);
    expect(advanceMock).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      pageId: 'page-1',
      values: [{ stepId: 'phone-step', value: '312-555-1212' }],
      submissionKey: expect.any(String),
    }));
    expect(submitPageMock).not.toHaveBeenCalled();
    expect(nextMock).not.toHaveBeenCalled();
    expect(setCurrentPageIndex).not.toHaveBeenCalled();
    expect(setShowReview).toHaveBeenCalledWith(true);
  });
});

function advanceResponse(submissionKey: string): ApiAdvanceResult {
  return { success: true, values: {}, blockStates: [], navigation: { nextPageId: 'page-2' }, submissionKey };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

type AdvanceContext = Parameters<RunNavigationTransport['advanceAfterValidation']>[0];

function renderTransport(saveNow = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)) {
  const hook = renderHook(() => useRunNavigationTransport({
    mode: 'production', previewEnvironment: null, getVisiblePageSteps: () => [phoneStep], saveNow,
  }));
  const context: AdvanceContext = {
    runId: 'live-run-1', currentPage: page, currentPageIndex: 0,
    visiblePages: [page, { ...page, id: 'page-2', order: 1 }], visiblePageSteps: [phoneStep],
    effectiveValues: { [phoneStep.id]: '312-555-1212' }, isLastPage: false,
    setCurrentPageIndex: vi.fn(), setShowReview: vi.fn(), returnToReviewAfterValidation: false,
  };
  return { ...hook, context, saveNow };
}

describe('shared advance transport submission identity', () => {
  beforeEach(() => {
    advanceMock.mockReset();
    advanceMock.mockImplementation(({ submissionKey }: { submissionKey: string }) => Promise.resolve(advanceResponse(submissionKey)));
    window.scrollTo = vi.fn();
  });

  it('replays the same key after lost responses and starts fresh after success', async () => {
    const sentKeys: string[] = [];
    advanceMock.mockImplementation(({ submissionKey }: { submissionKey: string }) => {
      sentKeys.push(submissionKey);
      if (sentKeys.length <= 2) { return Promise.reject(new Error('Response lost after commit')); }
      return Promise.resolve(advanceResponse(submissionKey));
    });
    const { result, context, rerender } = renderTransport();
    await expect(result.current.advanceAfterValidation(context)).rejects.toThrow('Response lost');
    rerender();
    await expect(result.current.advanceAfterValidation(context)).rejects.toThrow('Response lost');
    await result.current.advanceAfterValidation(context);
    await result.current.advanceAfterValidation(context);
    expect(sentKeys).toHaveLength(4);
    expect(sentKeys[1]).toBe(sentKeys[0]);
    expect(sentKeys[2]).toBe(sentKeys[0]);
    expect(sentKeys[3]).not.toBe(sentKeys[0]);
    expect(context.setCurrentPageIndex).toHaveBeenCalledTimes(2);
  });

  it('clears a validation rejection so corrected input gets a fresh key', async () => {
    const sentKeys: string[] = [];
    advanceMock.mockImplementation(({ submissionKey }: { submissionKey: string }) => {
      sentKeys.push(submissionKey);
      return Promise.resolve(sentKeys.length === 1
        ? { ...advanceResponse(submissionKey), success: false, errors: ['Invalid phone'], navigation: null }
        : advanceResponse(submissionKey));
    });
    const { result, context } = renderTransport();
    expect(await result.current.advanceAfterValidation(context)).toEqual({ kind: 'validation', errors: ['Invalid phone'] });
    expect(context.setCurrentPageIndex).not.toHaveBeenCalled();
    const corrected = { ...context, effectiveValues: { [phoneStep.id]: '773-555-1212' } };
    await result.current.advanceAfterValidation(corrected);
    expect(sentKeys[1]).not.toBe(sentKeys[0]);
    expect(advanceMock).toHaveBeenLastCalledWith(expect.objectContaining({ values: [{ stepId: phoneStep.id, value: '773-555-1212' }] }));
    expect(context.setCurrentPageIndex).toHaveBeenCalledWith(1);
  });

  it('blocks duplicate calls during both the autosave flush and the request', async () => {
    const flush = deferred<void>();
    const response = deferred<ApiAdvanceResult>();
    const saveNow = vi.fn(() => flush.promise);
    advanceMock.mockReturnValue(response.promise);
    const { result, context, rerender } = renderTransport(saveNow);
    const first = result.current.advanceAfterValidation(context);
    const duplicateDuringFlush = result.current.advanceAfterValidation(context);
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(advanceMock).not.toHaveBeenCalled();
    flush.resolve();
    await waitFor(() => { expect(advanceMock).toHaveBeenCalledTimes(1); });
    rerender();
    const duplicateDuringRequest = result.current.advanceAfterValidation(context);
    expect(advanceMock).toHaveBeenCalledTimes(1);
    const sent = advanceMock.mock.calls[0][0] as { submissionKey: string };
    response.resolve(advanceResponse(sent.submissionKey));
    await Promise.all([first, duplicateDuringFlush, duplicateDuringRequest]);
    expect(context.setCurrentPageIndex).toHaveBeenCalledTimes(1);
  });

  it.each(['run', 'page'] as const)('does not reuse a lost attempt key for another %s', async (changed) => {
    advanceMock.mockRejectedValueOnce(new Error('Connection lost'));
    const { result, context } = renderTransport();
    await expect(result.current.advanceAfterValidation(context)).rejects.toThrow('Connection lost');
    await result.current.advanceAfterValidation({
      ...context,
      runId: changed === 'run' ? 'live-run-2' : context.runId,
      currentPage: changed === 'page' ? { ...page, id: 'page-2' } : page,
    });
    const first = advanceMock.mock.calls[0][0] as { submissionKey: string };
    const second = advanceMock.mock.calls[1][0] as { submissionKey: string };
    expect(second.submissionKey).not.toBe(first.submissionKey);
  });

  it('discards mismatched response identities and clears the completed attempt', async () => {
    advanceMock.mockResolvedValueOnce(advanceResponse('unrelated-key'));
    const { result, context } = renderTransport();
    await result.current.advanceAfterValidation(context);
    expect(context.setCurrentPageIndex).not.toHaveBeenCalled();
    expect(context.setShowReview).not.toHaveBeenCalled();
    await result.current.advanceAfterValidation(context);
    const first = advanceMock.mock.calls[0][0] as { submissionKey: string };
    const second = advanceMock.mock.calls[1][0] as { submissionKey: string };
    expect(second.submissionKey).not.toBe(first.submissionKey);
    expect(context.setCurrentPageIndex).toHaveBeenCalledTimes(1);
  });

  it('discards a superseded response without clearing the newer pending attempt', async () => {
    const response = deferred<ApiAdvanceResult>();
    advanceMock.mockReturnValueOnce(response.promise).mockRejectedValueOnce(new Error('New response lost'));
    const { result, context } = renderTransport();
    const oldRequest = result.current.advanceAfterValidation(context);
    await waitFor(() => { expect(advanceMock).toHaveBeenCalledTimes(1); });
    const replacement = { ...context, runId: 'replacement-run' };
    await expect(result.current.advanceAfterValidation(replacement)).rejects.toThrow('New response lost');
    const old = advanceMock.mock.calls[0][0] as { submissionKey: string };
    const current = advanceMock.mock.calls[1][0] as { submissionKey: string };
    response.resolve(advanceResponse(old.submissionKey));
    await oldRequest;
    expect(context.setCurrentPageIndex).not.toHaveBeenCalled();
    await result.current.advanceAfterValidation(replacement);
    expect(advanceMock).toHaveBeenLastCalledWith(expect.objectContaining({ submissionKey: current.submissionKey }));
    expect(context.setCurrentPageIndex).toHaveBeenCalledTimes(1);
  });

  it('ignores a response after unmount', async () => {
    const response = deferred<ApiAdvanceResult>();
    advanceMock.mockReturnValueOnce(response.promise);
    const { result, context, unmount } = renderTransport();
    const request = result.current.advanceAfterValidation(context);
    await waitFor(() => { expect(advanceMock).toHaveBeenCalledTimes(1); });
    const sent = advanceMock.mock.calls[0][0] as { submissionKey: string };
    unmount();
    response.resolve(advanceResponse(sent.submissionKey));
    await request;
    expect(context.setCurrentPageIndex).not.toHaveBeenCalled();
    expect(context.setShowReview).not.toHaveBeenCalled();
  });

  it('releases the guard after autosave fails so the user can retry', async () => {
    const saveNow = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('Save failed')).mockResolvedValue(undefined);
    const { result, context } = renderTransport(saveNow);
    await expect(result.current.advanceAfterValidation(context)).rejects.toThrow('Save failed');
    expect(advanceMock).not.toHaveBeenCalled();
    await result.current.advanceAfterValidation(context);
    expect(advanceMock).toHaveBeenCalledTimes(1);
    expect(context.setCurrentPageIndex).toHaveBeenCalledWith(1);
  });
});
