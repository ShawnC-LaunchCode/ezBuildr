// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '../../../client/src/hooks/useAutoSave';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it('debounces save calls', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ data }) => useAutoSave({ data, onSave, delay: 1000 }),
      { initialProps: { data: { foo: 'bar' } } }
    );

    expect(onSave).not.toHaveBeenCalled();

    // Trigger change
    rerender({ data: { foo: 'baz' } });
    
    // Fast-forward half the delay
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onSave).not.toHaveBeenCalled();

    // Trigger another change before delay completes
    rerender({ data: { foo: 'qux' } });

    // Fast-forward past original delay, but new delay shouldn't be met
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onSave).not.toHaveBeenCalled();

    // Fast-forward past second delay
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ foo: 'qux' });
  });

  it('exposes saveNow to flush immediately', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave({ data, onSave, delay: 1000 }),
      { initialProps: { data: { foo: 'bar' } } }
    );

    rerender({ data: { foo: 'baz' } });

    await act(async () => {
      await result.current.saveNow();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ foo: 'baz' });

    // Ensure debounced call doesn't fire again
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onSave).toHaveBeenCalledTimes(1); // Still 1
  });

  it('triggers onSave on unmount if unsaved changes exist', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender, unmount } = renderHook(
      ({ data }) => useAutoSave({ data, onSave, delay: 1000 }),
      { initialProps: { data: { foo: 'bar' } } }
    );

    rerender({ data: { foo: 'baz' } });

    expect(result.current.hasUnsavedChanges).toBe(true);

    unmount();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ foo: 'baz' });
  });
});
