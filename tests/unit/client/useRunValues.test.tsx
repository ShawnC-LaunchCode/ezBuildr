// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { fetchAPI } from '../../../client/src/lib/vault-api';
import { KEEPALIVE_MAX_BYTES, useRunValues } from '../../../client/src/hooks/runner/useRunValues';

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

describe('useRunValues — LIST2-4 (autosave keepalive above the 64 KiB Fetch cap)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchAPI).mockResolvedValue({});
  });

  it('sends keepalive: true for a payload under the threshold', async () => {
    const { result } = renderRunValues({ run: { values: [] }, actualRunId: 'run-small' });

    act(() => {
      result.current.handleUpdateValue('step-text', 'hello world');
    });
    await act(async () => {
      await result.current.saveNow();
    });

    expect(fetchAPI).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetchAPI).mock.calls[0];
    expect(url).toBe('/api/runs/run-small/values/bulk');
    expect(options?.keepalive).toBe(true);
    expect(new Blob([options?.body as string]).size).toBeLessThan(KEEPALIVE_MAX_BYTES);
  });

  it('sends keepalive falsy for a payload over the threshold, otherwise byte-identical', async () => {
    // A genuinely large fixture (not a mocked size) that straddles the real
    // 60 KiB constant so the test fails if the threshold check is removed.
    const bigValue = 'x'.repeat(80 * 1024);
    const { result } = renderRunValues({ run: { values: [] }, actualRunId: 'run-large' });

    act(() => {
      result.current.handleUpdateValue('step-big', bigValue);
    });
    await act(async () => {
      await result.current.saveNow();
    });

    expect(fetchAPI).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetchAPI).mock.calls[0];
    const parsedBody = JSON.parse(options?.body as string) as { values: Array<{ stepId: string; value: string; clientTimestamp: number }> };

    expect(url).toBe('/api/runs/run-large/values/bulk');
    expect(new Blob([options?.body as string]).size).toBeGreaterThan(KEEPALIVE_MAX_BYTES);
    expect(parsedBody.values[0].stepId).toBe('step-big');
    expect(parsedBody.values[0].value).toBe(bigValue);
    expect(typeof parsedBody.values[0].clientTimestamp).toBe('number');
    expect(options?.keepalive).toBeFalsy();
    expect(options?.method).toBe('POST');
  });
});
