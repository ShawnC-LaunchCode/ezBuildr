import crypto from 'crypto';
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
    // Protection is OPTIONAL and keyed off METRICS_API_KEY: when no key is
    // configured the endpoint is open (Prometheus scraping is typically locked
    // down at the network layer); when a key IS configured it must be supplied
    // via the x-api-key header. Auth is always skipped in the test environment.
    const isTestEnv = process.env.NODE_ENV === 'test';
    const metricsApiKey = process.env.METRICS_API_KEY;

    if (!isTestEnv && metricsApiKey) {
      const providedKey = req.headers['x-api-key'];

      if (!providedKey || typeof providedKey !== 'string') {
        logger.warn({ ip: req.ip }, 'Unauthorized metrics access attempt (missing or invalid key)');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      let isMatch = false;
      try {
          const providedBuffer = Buffer.from(providedKey);
          const expectedBuffer = Buffer.from(metricsApiKey);
          
          if (providedBuffer.length === expectedBuffer.length) {
              isMatch = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
          }
      } catch (err) {
          isMatch = false;
      }

      if (!isMatch) {
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
