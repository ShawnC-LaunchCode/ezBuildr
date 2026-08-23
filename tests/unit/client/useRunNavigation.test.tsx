// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nextMock, submitPageMock, validatePageMock, toastMock } = vi.hoisted(() => ({
  nextMock: vi.fn(),
  submitPageMock: vi.fn(),
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
    submitPageMock.mockResolvedValue({ success: true });
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
    expect(submitPageMock).toHaveBeenCalledWith({
      runId: 'run-1',
      pageId: 'page-1',
      values: [{ stepId: 'phone-step', value: '312-555-1212' }],
    });
    expect(nextMock).not.toHaveBeenCalled();
    expect(setCurrentPageIndex).not.toHaveBeenCalled();
    expect(setShowReview).toHaveBeenCalledWith(true);
  });
});
