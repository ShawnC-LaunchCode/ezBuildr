import { createLogger } from '../logger';
import { getPrometheusExporter } from '../observability/telemetry';
import { asyncHandler } from '../utils/asyncHandler';

import type { Express, Request, Response } from 'express';

const logger = createLogger({ module: 'metrics-routes' });

/**
 * Register metrics endpoint for Prometheus scraping
 */
export function registerMetricsRoutes(app: Express): void {
  /**
   * GET /metrics
   * Prometheus-compatible metrics endpoint
   *
   * Optional protection via METRICS_API_KEY environment variable
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
    // Optional API key protection
    const metricsApiKey = process.env.METRICS_API_KEY;

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (metricsApiKey) {
      const providedKey = req.headers['x-api-key'] ?? req.query.apiKey;

      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!providedKey || providedKey !== metricsApiKey) {
        logger.warn({ ip: req.ip }, 'Unauthorized metrics access attempt');
        return res.status(401).json({ message: 'Unauthorized' });
      }
    }

    // Get Prometheus exporter
    const exporter = getPrometheusExporter();

    if (!exporter) {
      // Telemetry not initialized
      return res.status(503).json({
        message: 'Metrics not available',
        hint: 'Set ENABLE_TELEMETRY=true to enable metrics'
      });
    }

    // Return Prometheus metrics
    // The exporter's request handler writes the response directly
    exporter.getMetricsRequestHandler(req, res);
  }));

  logger.info('Metrics endpoint registered at GET /metrics');
}
