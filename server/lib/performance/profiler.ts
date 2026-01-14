import { logger } from "../observability/logger";
import { metrics } from "../observability/metrics";

export class Profiler {
    /**
     * Measure the execution time of a synchronous function.
     */
    static measure<T>(name: string, fn: () => T, labels: Record<string, string> = {}): T {
        const start = process.hrtime();
        try {
            return fn();
        } finally {
            const end = process.hrtime(start);
            const durationMs = (end[0] * 1000) + (end[1] / 1e6);
            this.record(name, durationMs, labels);
        }
    }

    /**
     * Measure the execution time of an asynchronous function.
     */
    static async measureAsync<T>(name: string, fn: () => Promise<T>, labels: Record<string, string> = {}): Promise<T> {
        const start = process.hrtime();
        try {
            return await fn();
        } finally {
            const end = process.hrtime(start);
            const durationMs = (end[0] * 1000) + (end[1] / 1e6);
            this.record(name, durationMs, labels);
        }
    }

    private static record(name: string, durationMs: number, labels: Record<string, string>) {
        // Record to metrics
        metrics.observe(name, durationMs, labels);

        // Log slow operations (e.g., > 100ms)
        if (durationMs > 100) {
            logger.warn({ msg: "Slow operation detected", op: name, durationMs, ...labels });
        }
    }
}
