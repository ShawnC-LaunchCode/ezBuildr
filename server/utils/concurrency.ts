
/**
 * Simple concurrency limiter (semaphore)
 * Used to limit concurrent heavy operations like DOCX scanning or PDF conversion
 * to prevent CPU spikes and OOM.
 */
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
