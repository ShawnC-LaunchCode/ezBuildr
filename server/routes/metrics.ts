import { createLogger } from '../logger';
import { getPrometheusExporter } from '../observability/telemetry';

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
  app.get('/metrics', async (req: Request, res: Response) => {
    try {
      // Optional API key protection
      const metricsApiKey = process.env.METRICS_API_KEY;

      if (metricsApiKey) {
        const providedKey = req.headers['x-api-key'] || req.query.apiKey;

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
      // Return Prometheus metrics
      // The exporter's request handler writes the response directly
      exporter.getMetricsRequestHandler(req, res);
    } catch (error) {
      logger.error({ error }, 'Error serving metrics');
      res.status(500).json({ message: 'Failed to generate metrics' });
    }
  });

  logger.info('Metrics endpoint registered at GET /metrics');
}
