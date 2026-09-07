// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
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
import type { ApiPage, ApiStep } from '../../../client/src/lib/vault-api';

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
    advanceMock.mockResolvedValue({ success: true, values: {}, blockStates: [], navigation: null, submissionKey: 'k' });
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
    advanceMock.mockResolvedValue({ success: true, values: {}, blockStates: [], navigation: null, submissionKey: 'k' });
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
