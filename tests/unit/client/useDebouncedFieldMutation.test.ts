// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { useDebouncedFieldMutation } from '../../../client/src/hooks/useDebouncedFieldMutation';

/**
 * ICW-8 acceptance coverage: debounce, latest-wins coalescing, flush on blur,
 * flush on unmount, and server-echo handling while dirty/clean.
 */
describe('useDebouncedFieldMutation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it('debounces: rapid keystrokes produce ONE flush with the latest value', () => {
    const onFlush = vi.fn();
    const { result } = renderHook(() => useDebouncedFieldMutation<string>('initial', onFlush));

    act(() => {
      result.current.onChange('a');
      result.current.onChange('ab');
      result.current.onChange('abc');
    });
    expect(result.current.localValue).toBe('abc');
    expect(onFlush).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('abc');
  });

  it('keystroke mid-window restarts the timer (no early flush)', () => {
    const onFlush = vi.fn();
    const { result } = renderHook(() => useDebouncedFieldMutation<string>('x', onFlush));

    act(() => {
      result.current.onChange('y');
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      result.current.onChange('yz');
    });
    act(() => {
      vi.advanceTimersByTime(500); // 1000ms total, but only 500ms since last change
    });
    expect(onFlush).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('yz');
  });

  it('flushes immediately on blur and cancels the pending timer', () => {
    const onFlush = vi.fn();
    const { result } = renderHook(() => useDebouncedFieldMutation<string>('x', onFlush));

    act(() => {
      result.current.onChange('typed');
      result.current.onBlur();
    });
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('typed');

    // The debounce timer must not fire a second flush afterwards.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('does not flush on blur when nothing is dirty', () => {
    const onFlush = vi.fn();
    const { result } = renderHook(() => useDebouncedFieldMutation<string>('x', onFlush));

    act(() => {
      result.current.onBlur();
    });
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('flushes a pending edit on unmount (no lost writes on navigation)', () => {
    const onFlush = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedFieldMutation<string>('x', onFlush));

    act(() => {
      result.current.onChange('almost lost');
    });
    unmount();
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('almost lost');
  });

  it('ignores server echoes while dirty, syncs when clean', () => {
    const onFlush = vi.fn();
    const { result, rerender } = renderHook(
      ({ server }) => useDebouncedFieldMutation<string>(server, onFlush),
      { initialProps: { server: 'v1' } }
    );

    // Dirty: a server echo must not clobber in-progress typing.
    act(() => {
      result.current.onChange('typing');
    });
    rerender({ server: 'v1-echo' });
    expect(result.current.localValue).toBe('typing');

    // Flush → clean; now server truth (e.g. a rollback after a failed save)
    // must win.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    rerender({ server: 'server-truth' });
    expect(result.current.localValue).toBe('server-truth');
  });
});
