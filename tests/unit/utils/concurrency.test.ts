import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ConcurrencyLimiter,
  PROCESSING_TIMEOUT_ERROR_CODE,
  ProcessingTimeoutError,
  withTimeout,
} from '../../../server/utils/concurrency';

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves work completed within the budget and clears its timer', async () => {
    vi.useFakeTimers();

    await expect(withTimeout(() => Promise.resolve('done'), 1_000, 'fast-work'))
      .resolves.toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects expired work with a distinguishable error and clears its timer', async () => {
    vi.useFakeTimers();
    const result = withTimeout(
      () => new Promise<never>(() => {}),
      1_000,
      'hung-work'
    );
    const rejection = expect(result).rejects.toMatchObject({
      name: 'ProcessingTimeoutError',
      code: PROCESSING_TIMEOUT_ERROR_CODE,
      label: 'hung-work',
      timeoutMs: 1_000,
      elapsedMs: 1_000,
    } satisfies Partial<ProcessingTimeoutError>);

    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when the operation rejects before expiry', async () => {
    vi.useFakeTimers();
    const failure = new Error('operation failed');

    await expect(withTimeout(() => Promise.reject(failure), 1_000, 'failed-work'))
      .rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases limiter slots after N+1 timeouts so subsequent work can run', async () => {
    const maxConcurrency = 2;
    const limiter = new ConcurrencyLimiter(maxConcurrency);
    const timedOut = Array.from({ length: maxConcurrency + 1 }, (_, index) =>
      limiter.run(() =>
        withTimeout(
          () => new Promise<never>(() => {}),
          5,
          `hung-work-${index}`
        )
      )
    );

    const results = await Promise.allSettled(timedOut);

    expect(results).toHaveLength(maxConcurrency + 1);
    expect(results.every(
      result => result.status === 'rejected' &&
        result.reason instanceof ProcessingTimeoutError
    )).toBe(true);
    expect(limiter.active).toBe(0);
    expect(limiter.pending).toBe(0);
    await expect(limiter.run(() => Promise.resolve('recovered'))).resolves.toBe('recovered');
  });
});
