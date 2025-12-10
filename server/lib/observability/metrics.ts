import { logger } from "./logger";

/**
 * Simple in-memory metrics collector.
 * In a real production setup, this should be replaced with Prometheus/OpenTelemetry client.
 * For now, we expose a way to track key business metrics.
 */

type MetricType = "counter" | "histogram" | "gauge";

interface Metric {
    name: string;
    type: MetricType;
    value: number;
    labels: Record<string, string>;
    timestamp: number;
}

class MetricsCollector {
    private metrics: Metric[] = [];

    constructor() {
        // Periodically log aggregated metrics or flush to external system
        setInterval(() => this.flush(), 60000);
    }

    increment(name: string, labels: Record<string, string> = {}, value: number = 1) {
        this.metrics.push({
            name,
            type: "counter",
            value,
            labels,
            timestamp: Date.now()
        });
    }

    gauge(name: string, value: number, labels: Record<string, string> = {}) {
        this.metrics.push({
            name,
            type: "gauge",
            value,
            labels,
            timestamp: Date.now()
        });
    }

    observe(name: string, value: number, labels: Record<string, string> = {}) {
        this.metrics.push({
            name,
            type: "histogram",
            value,
            labels,
            timestamp: Date.now()
        });
    }

    private flush() {
        if (this.metrics.length === 0) return;

        // In a real app, push to Prometheus/Datadog here.
        // For now, we just log a summary to avoid flooding logs.
        const summary = this.metrics.reduce((acc, metric) => {
            const key = `${metric.name}`;
            acc[key] = (acc[key] || 0) + metric.value;
            return acc;
        }, {} as Record<string, number>);

        logger.info({ msg: "Metrics Flush", summary });
        this.metrics = [];
    }
}

export const metrics = new MetricsCollector();
