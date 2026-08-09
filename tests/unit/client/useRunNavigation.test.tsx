// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { nextMock, submitSectionMock, validatePageMock, toastMock } = vi.hoisted(() => ({
  nextMock: vi.fn(),
  submitSectionMock: vi.fn(),
  validatePageMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('../../../client/src/lib/vault-hooks', () => ({
  useCompleteRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitSection: () => ({ mutateAsync: submitSectionMock }),
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
import type { ApiSection, ApiStep } from '../../../client/src/lib/vault-api';

const section: ApiSection = {
  id: 'section-1',
  workflowId: 'workflow-1',
  title: 'Contact details',
  description: null,
  order: 0,
  createdAt: '2026-07-25T00:00:00.000Z',
};

const phoneStep: ApiStep = {
  id: 'phone-step',
  workflowId: 'workflow-1',
  sectionId: section.id,
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
    submitSectionMock.mockReset();
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
      getVisibleSectionSteps: () => [phoneStep],
      saveBeforeLeavingSection: vi.fn().mockResolvedValue(undefined),
      recordValidationPassed: vi.fn().mockResolvedValue(undefined),
      recordValidationException: vi.fn().mockResolvedValue(undefined),
      advanceAfterValidation: vi.fn().mockResolvedValue(undefined),
    };

    const { result } = renderHook(() =>
      useRunNavigation({
        actualRunId: 'run-1',
        visibleSections: [section],
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

  it('submits an edited section and returns directly to review without advancing', async () => {
    submitSectionMock.mockResolvedValue({ success: true });
    const setCurrentSectionIndex = vi.fn();
    const setShowReview = vi.fn();
    const saveNow = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRunNavigationTransport({
      mode: 'production',
      previewEnvironment: null,
      getVisibleSectionSteps: () => [phoneStep],
      saveNow,
    }));

    await act(async () => {
      await result.current.advanceAfterValidation({
        runId: 'run-1',
        currentSection: section,
        currentSectionIndex: 0,
        visibleSections: [section],
        visibleSectionSteps: [phoneStep],
        effectiveValues: { 'phone-step': '312-555-1212' },
        isLastSection: false,
        setCurrentSectionIndex,
        setShowReview,
        returnToReviewAfterValidation: true,
      });
    });

    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(submitSectionMock).toHaveBeenCalledWith({
      runId: 'run-1',
      sectionId: 'section-1',
      values: [{ stepId: 'phone-step', value: '312-555-1212' }],
    });
    expect(nextMock).not.toHaveBeenCalled();
    expect(setCurrentSectionIndex).not.toHaveBeenCalled();
    expect(setShowReview).toHaveBeenCalledWith(true);
  });
});
