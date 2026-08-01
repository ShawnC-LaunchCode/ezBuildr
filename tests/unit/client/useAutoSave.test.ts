// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { useAutoSave } from '../../../client/src/hooks/useAutoSave';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

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

  it('serializes saves and drains edits made during an in-flight save', async () => {
    const firstSave = deferred();
    const secondSave = deferred();
    const onSave = vi.fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementationOnce(() => secondSave.promise);
    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave({ data, onSave, delay: 1000 }),
      { initialProps: { data: { foo: 'initial' } } }
    );

    rerender({ data: { foo: 'first' } });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenNthCalledWith(1, { foo: 'first' });
    expect(result.current.saveStatus).toBe('saving');

    rerender({ data: { foo: 'latest' } });

    let saveNowSettled = false;
    let saveNowPromise!: Promise<void>;
    act(() => {
      saveNowPromise = result.current.saveNow().then(() => {
        saveNowSettled = true;
      });
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(saveNowSettled).toBe(false);

    await act(async () => {
      firstSave.resolve();
      await firstSave.promise;
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenNthCalledWith(2, { foo: 'latest' });
    expect(saveNowSettled).toBe(false);
    expect(result.current.hasUnsavedChanges).toBe(true);

    await act(async () => {
      secondSave.resolve();
      await saveNowPromise;
    });

    expect(saveNowSettled).toBe(true);
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.saveStatus).toBe('saved');
  });

  it('keeps a failed revision dirty and retries it on saveNow', async () => {
    const saveError = new Error('network unavailable');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSave = vi.fn()
      .mockRejectedValueOnce(saveError)
      .mockResolvedValueOnce(undefined);
    const { result, rerender } = renderHook(
      ({ data }) => useAutoSave({ data, onSave, delay: 1000 }),
      { initialProps: { data: { foo: 'initial' } } }
    );

    rerender({ data: { foo: 'changed' } });

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.saveStatus).toBe('error');
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(consoleError).toHaveBeenCalledWith('Auto-save error:', saveError);

    await act(async () => {
      await result.current.saveNow();
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenNthCalledWith(2, { foo: 'changed' });
    expect(result.current.saveStatus).toBe('saved');
    expect(result.current.hasUnsavedChanges).toBe(false);
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
