// @vitest-environment jsdom
/**
 * LIST-9 — Section "Next" enforcement for list steps (AC5) and the
 * label-based error summary (AC6). A separate file from
 * useRunNavigation.test.tsx on purpose: that file replaces the whole
 * `shared/validation/BlockValidation` module with a stub `getValidationSchema`
 * (vi.mock is module-scoped, so it can't be partially applied per test), and
 * this suite needs the REAL `validateListValue`/`getValidationSchema` to
 * exercise the actual list-validation path end to end.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
}));

vi.mock('../../../client/src/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('../../../client/src/lib/vault-hooks', () => ({
  useCompleteRun: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitSection: () => ({ mutateAsync: vi.fn() }),
  useNext: () => ({ mutateAsync: vi.fn() }),
}));

import { useRunNavigation, type RunNavigationTransport } from '../../../client/src/hooks/runner/useRunNavigation';
import type { ApiSection, ApiStep } from '../../../client/src/lib/vault-api';
import type { ListConfig } from '../../../shared/types/stepConfigs';

const section: ApiSection = {
  id: 'section-1',
  workflowId: 'workflow-1',
  title: 'Family',
  description: null,
  order: 0,
  createdAt: '2026-07-25T00:00:00.000Z',
};

const childrenConfig: ListConfig = {
  fields: [
    { kind: 'question', id: 'f-name', alias: 'name', type: 'short_text', title: 'Name', order: 0 },
    { kind: 'question', id: 'f-dob', alias: 'dob', type: 'short_text', title: 'DOB', order: 1, required: true },
  ],
  labelTemplate: '{name}',
};

const listStep: ApiStep = {
  id: 'children-step',
  workflowId: 'workflow-1',
  sectionId: section.id,
  type: 'list',
  title: 'Children',
  description: null,
  required: false,
  order: 0,
  config: childrenConfig as unknown as Record<string, unknown>,
  alias: 'children',
  visibleIf: null,
  createdAt: '2026-07-25T00:00:00.000Z',
};

function makeTransport(): RunNavigationTransport {
  return {
    getVisibleSectionSteps: () => [listStep],
    saveBeforeLeavingSection: vi.fn().mockResolvedValue(undefined),
    recordValidationPassed: vi.fn().mockResolvedValue(undefined),
    recordValidationException: vi.fn().mockResolvedValue(undefined),
    advanceAfterValidation: vi.fn().mockResolvedValue(undefined),
  };
}

describe('useRunNavigation: list step validation (LIST-9)', () => {
  beforeEach(() => {
    toastMock.mockReset();
  });

  it('blocks Next when a required field inside an item is empty, naming the item by its resolved label (AC2, AC5, AC6)', async () => {
    const transport = makeTransport();
    const { result } = renderHook(() =>
      useRunNavigation({
        actualRunId: 'run-1',
        visibleSections: [section],
        effectiveValues: { 'children-step': { items: [{ itemId: 'a', values: { name: 'Ben Chen' } }] } },
        transport,
      })
    );

    await act(async () => {
      await result.current.handleNext();
    });

    expect(result.current.errors).toEqual(['Ben Chen — DOB is required']);
    expect(transport.advanceAfterValidation).not.toHaveBeenCalled();
  });

  it('advances once the field is fixed (AC7, via the section validation path)', async () => {
    const transport = makeTransport();
    const { result } = renderHook(() =>
      useRunNavigation({
        actualRunId: 'run-1',
        visibleSections: [section],
        effectiveValues: { 'children-step': { items: [{ itemId: 'a', values: { name: 'Ben Chen', dob: '2020-01-01' } }] } },
        transport,
      })
    );

    await act(async () => {
      await result.current.handleNext();
    });

    expect(result.current.errors).toEqual([]);
    expect(transport.advanceAfterValidation).toHaveBeenCalledTimes(1);
  });

  it('blocks Next for a required list with zero items even when minItems is unset (LIST-8\'s flagged gap)', async () => {
    const requiredListStep: ApiStep = { ...listStep, required: true };
    const transport: RunNavigationTransport = { ...makeTransport(), getVisibleSectionSteps: () => [requiredListStep] };

    const { result } = renderHook(() =>
      useRunNavigation({
        actualRunId: 'run-1',
        visibleSections: [section],
        effectiveValues: { 'children-step': { items: [] } },
        transport,
      })
    );

    await act(async () => {
      await result.current.handleNext();
    });

    expect(result.current.errors).toEqual(['Children — At least 1 item is required']);
    expect(transport.advanceAfterValidation).not.toHaveBeenCalled();
  });

  it('does not block Next for a non-required list with zero items', async () => {
    const transport = makeTransport();
    const { result } = renderHook(() =>
      useRunNavigation({
        actualRunId: 'run-1',
        visibleSections: [section],
        effectiveValues: { 'children-step': { items: [] } },
        transport,
      })
    );

    await act(async () => {
      await result.current.handleNext();
    });

    expect(result.current.errors).toEqual([]);
    expect(transport.advanceAfterValidation).toHaveBeenCalledTimes(1);
  });

  it('leaves fieldErrors (the flat Record<stepId,string[]> contract) untouched for list steps (AC1)', async () => {
    const transport = makeTransport();
    const { result } = renderHook(() =>
      useRunNavigation({
        actualRunId: 'run-1',
        visibleSections: [section],
        effectiveValues: { 'children-step': { items: [{ itemId: 'a', values: { name: 'Ben Chen' } }] } },
        transport,
      })
    );

    await act(async () => {
      await result.current.handleNext();
    });

    // The list step never gets an entry in the flat map — its errors are
    // additive (the `errors` summary array), not squeezed into fieldErrors.
    expect(result.current.fieldErrors).toEqual({});
  });
});
