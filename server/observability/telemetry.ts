import { metrics, trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { NodeSDK } from '@opentelemetry/sdk-node';

import { createLogger } from '../logger';

const logger = createLogger({ module: 'telemetry' });

let sdk: NodeSDK | null = null;
let prometheusExporter: PrometheusExporter | null = null;

/**
 * Initialize OpenTelemetry instrumentation
 * MUST be called before any other imports to ensure proper instrumentation
 */
export function initTelemetry() {
  try {
    // Only initialize in production or if explicitly enabled
    const enableTelemetry = process.env.ENABLE_TELEMETRY === 'true' || process.env.NODE_ENV === 'production';

    if (!enableTelemetry) {
      logger.info('OpenTelemetry disabled (set ENABLE_TELEMETRY=true to enable)');
      return;
    }

    // Configure Prometheus exporter
    prometheusExporter = new PrometheusExporter({
      port: parseInt(process.env.METRICS_PORT || '9464', 10),
      endpoint: '/metrics',
      preventServerStart: true,
    });

    // Initialize NodeSDK with auto-instrumentation
    sdk = new NodeSDK({
      metricReader: prometheusExporter,
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable specific instrumentations if needed
          '@opentelemetry/instrumentation-fs': {
            enabled: false, // Can be noisy
          },
        }),
      ],
    });

    sdk.start();
    logger.info('OpenTelemetry SDK initialized successfully');
    logger.info(`Prometheus metrics initialized`);
  } catch (error) {
    logger.error({ error }, 'Failed to initialize OpenTelemetry SDK');
    // Don't throw - telemetry should never break the application
  }
}

/**
 * Shutdown telemetry gracefully
 */
export async function shutdownTelemetry() {
  if (sdk) {
    try {
      await sdk.shutdown();
      logger.info('OpenTelemetry SDK shut down successfully');
    } catch (error) {
      logger.error({ error }, 'Error shutting down OpenTelemetry SDK');
    }
  }
}

/**
 * Get the meter for creating metrics
 */
export function getMeter() {
  return metrics.getMeter('ezbuildr', '1.0.0');
}

/**
 * Get the tracer for creating spans
 */
export function getTracer() {
  return trace.getTracer('ezbuildr', '1.0.0');
}

/**
 * Get the Prometheus exporter for accessing metrics endpoint
 */
export function getPrometheusExporter() {
  return prometheusExporter;
}
