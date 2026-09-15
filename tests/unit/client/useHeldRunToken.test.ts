// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useHeldRunToken } from '../../../client/src/hooks/runner/useHeldRunToken';
import { clearRunToken, setRunToken } from '../../../client/src/lib/runTokens';

afterEach(() => {
  localStorage.clear();
});

describe('useHeldRunToken', () => {
  it('returns the stored run token while the run is in progress', () => {
    setRunToken('run-1', 'token-1');
    const { result } = renderHook(() => useHeldRunToken('run-1'));
    expect(result.current).toBe('token-1');
  });

  // 2026-09-15: submit clears the stored token, and the completion screen then
  // listed the run's documents with no credential and got 401.
  it('keeps the token for the completion screen after submit clears it from storage', () => {
    setRunToken('run-1', 'token-1');
    const { result, rerender } = renderHook(() => useHeldRunToken('run-1'));
    expect(result.current).toBe('token-1');

    clearRunToken('run-1');
    rerender();

    expect(result.current).toBe('token-1');
    // Storage hygiene is unchanged: the token is gone from localStorage.
    expect(localStorage.getItem('run_token_run-1')).toBeNull();
  });

  it('never hands one run\'s held token to a different run', () => {
    setRunToken('run-1', 'token-1');
    const { result, rerender } = renderHook(({ runId }) => useHeldRunToken(runId), {
      initialProps: { runId: 'run-1' as string | null },
    });
    expect(result.current).toBe('token-1');

    clearRunToken('run-1');
    rerender({ runId: 'run-2' });
    expect(result.current).toBeNull();
  });

  it('returns null when there is no run and no token', () => {
    const { result } = renderHook(() => useHeldRunToken(null));
    expect(result.current).toBeNull();
  });
});
