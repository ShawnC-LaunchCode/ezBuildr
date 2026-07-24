// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useRunValues } from '../../../client/src/hooks/runner/useRunValues';

vi.mock('@/lib/vault-api', () => ({
  fetchAPI: vi.fn().mockResolvedValue({}),
}));

interface HookProps {
  run: { values?: { stepId: string; value: unknown }[] } | null | undefined;
  actualRunId: string | null;
}

function renderRunValues(initial: HookProps) {
  return renderHook(
    ({ run, actualRunId }: HookProps) =>
      useRunValues({
        mode: 'production',
        actualRunId,
        run,
        previewState: null,
        previewEnvironment: null,
        allSteps: [],
        intakeData: null,
      }),
    { initialProps: initial }
  );
}

describe('useRunValues — ICW2-B10 (saved-run hydration must not clobber live answers)', () => {
  it('does not wipe a just-answered value when the parent re-renders with a new-but-equivalent `run` object', () => {
    // Mirrors the real bug: useRunSession used to rebuild `run` as a brand-new
    // object literal on every render (no memoization), so this hydration
    // effect re-ran on every render and unconditionally reset formValues back
    // to the server snapshot — silently discarding whatever the user had just
    // answered, and looping forever ("Maximum update depth exceeded").
    const { result, rerender } = renderRunValues({
      run: { values: [] },
      actualRunId: 'run-1',
    });

    act(() => {
      result.current.handleUpdateValue('step-yesno', true);
    });
    expect(result.current.effectiveValues).toEqual({ 'step-yesno': true });

    // Simulate an unrelated parent re-render producing a new `run` reference
    // with identical (still-empty) server-persisted values.
    rerender({ run: { values: [] }, actualRunId: 'run-1' });

    expect(result.current.effectiveValues).toEqual({ 'step-yesno': true });

    // And again, for good measure — the effect must not keep re-firing.
    rerender({ run: { values: [] }, actualRunId: 'run-1' });
    expect(result.current.effectiveValues).toEqual({ 'step-yesno': true });
  });

  it('still hydrates from the saved run once, merging under (not over) any local edit', () => {
    const { result, rerender } = renderRunValues({
      run: { values: [{ stepId: 'step-yesno', value: true }] },
      actualRunId: 'run-2',
    });

    expect(result.current.effectiveValues).toEqual({ 'step-yesno': true });

    // A later, unrelated local edit must survive a subsequent re-render even
    // if `run` is replaced by a new-but-equivalent object again.
    act(() => {
      result.current.handleUpdateValue('step-date', '2026-08-01');
    });
    rerender({ run: { values: [{ stepId: 'step-yesno', value: true }] }, actualRunId: 'run-2' });

    expect(result.current.effectiveValues).toEqual({
      'step-yesno': true,
      'step-date': '2026-08-01',
    });
  });

  it('re-hydrates when the user actually moves to a different run', () => {
    const { result, rerender } = renderRunValues({
      run: { values: [{ stepId: 'step-yesno', value: true }] },
      actualRunId: 'run-3',
    });
    expect(result.current.effectiveValues).toEqual({ 'step-yesno': true });

    rerender({
      run: { values: [{ stepId: 'step-yesno', value: false }] },
      actualRunId: 'run-4',
    });
    expect(result.current.effectiveValues).toEqual({ 'step-yesno': false });
  });
});
