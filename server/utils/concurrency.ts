
/**
 * Simple concurrency limiter (semaphore)
 * Used to limit concurrent heavy operations like DOCX scanning or PDF conversion
 * to prevent CPU spikes and OOM.
 */
export const PROCESSING_TIMEOUT_ERROR_CODE = 'PROCESSING_TIMEOUT';

export class ProcessingTimeoutError extends Error {
    readonly code = PROCESSING_TIMEOUT_ERROR_CODE;

    constructor(
        readonly label: string,
        readonly timeoutMs: number,
        readonly elapsedMs: number
    ) {
        super(`${label} exceeded the ${timeoutMs}ms processing timeout`);
        this.name = 'ProcessingTimeoutError';
    }
}

export function isProcessingTimeoutError(error: unknown): error is ProcessingTimeoutError {
    return error instanceof ProcessingTimeoutError;
}

/**
 * Bound an operation with a wall-clock budget, rejecting with
 * {@link ProcessingTimeoutError} on expiry.
 *
 * **This bounds asynchronous stalls, not CPU spin.** It is a `Promise.race`, so
 * the timer is a macrotask: work that blocks the event loop also blocks the
 * timer, and the budget cannot fire until that work finishes. Measured
 * 2026-07-27 — a 1500ms synchronous spin under a 100ms budget ran to completion
 * without timing out.
 *
 * That matters here because `PizZip` parsing and `zip.generate()` are
 * synchronous. A pathological archive that spins the parser is bounded by the
 * ZIP declared-size/ratio limits in `server/utils/zipLimits.ts`, which reject it
 * *before* parsing — not by this helper. Use both; neither alone is sufficient.
 *
 * Note also that on expiry the underlying operation is not cancelled (JS has no
 * such primitive); it keeps running, but the caller and its concurrency slot are
 * released.
 */
export async function withTimeout<T>(
    fn: () => Promise<T> | T,
    ms: number,
    label: string
): Promise<T> {
    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(new ProcessingTimeoutError(label, ms, Date.now() - startedAt));
        }, ms);
    });

    try {
        return await Promise.race([Promise.resolve().then(fn), timeout]);
    } finally {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
    }
}

export class ConcurrencyLimiter {
    private queue: (() => void)[] = [];
    private activeCount = 0;

    constructor(private maxConcurrency: number) { }

    async run<T>(fn: () => Promise<T>): Promise<T> {
        if (this.activeCount < this.maxConcurrency) {
            this.activeCount++;
            return this.execute(fn);
        }
        return new Promise<T>((resolve, reject) => {
            this.queue.push(() => {
                this.activeCount++;
                this.execute(fn).then(resolve).catch(reject);
            });
        });
    }

    private async execute<T>(fn: () => Promise<T>): Promise<T> {
        try {
            return await fn();
        } finally {
            this.activeCount--;
            if (this.queue.length > 0) {
                const next = this.queue.shift();
                next?.();
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    get pending() {
        return this.queue.length;
    }

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    get active() {
        return this.activeCount;
    }
}
