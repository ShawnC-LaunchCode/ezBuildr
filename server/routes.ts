import { createServer, type Server } from "http";

import { setupAuth } from "./googleAuth";
import { startRollupWorker } from "./jobs/metricsRollup";
import { logger } from "./lib/observability/logger";
import { metrics } from "./lib/observability/metrics";
import { initCollabServer, getMetrics, getRoomStats } from "./realtime/collabServer";
import { userRepository } from "./repositories";
import { registerDiagnosticRoutes } from "./routes/diagnostic.routes";
import healthRouter from "./routes/health";
import { registerAllRoutes } from "./routes/index";

import type { Express } from "express";

/**
 * Main route registration function
 * Sets up authentication and delegates to modular route handlers
 */
export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  await setupAuth(app);

  // Register diagnostic routes (dev only/debugging)
  registerDiagnosticRoutes(app);

  // Health check endpoints (no authentication required)
  app.use(healthRouter);

  // Register all modular routes
  registerAllRoutes(app);

  // Real-time collaboration metrics endpoint (dev only)
  if (process.env.NODE_ENV === 'development') {
    app.get('/api/realtime/metrics', (req, res) => {
      try {
        const metrics = getMetrics();
        res.json(metrics);
      } catch (error) {
        logger.error({ error }, 'Failed to get collab metrics');
        res.status(500).json({ error: 'Failed to get metrics' });
      }
    });

    app.get('/api/realtime/rooms/:roomId/stats', (req, res) => {
      try {
        const stats = getRoomStats(req.params.roomId);
        if (!stats) {
          return res.status(404).json({ error: 'Room not found' });
        }
        res.json(stats);
      } catch (error) {
        logger.error({ error }, 'Failed to get room stats');
        res.status(500).json({ error: 'Failed to get room stats' });
      }
    });
  }

  const httpServer = createServer(app);

  // Initialize WebSocket collaboration server
  initCollabServer(httpServer);

  // INCREASE SERVER TIMEOUTS (Fix for AI 60s timeout)
  httpServer.setTimeout(600000); // 10 minutes
  httpServer.keepAliveTimeout = 600000;
  httpServer.headersTimeout = 601000; // Must be higher than keepAliveTimeout

  logger.info('Real-time collaboration server initialized');

  // Start metrics rollup worker (Stage 11)
  // Runs every minute to aggregate metrics events into rollups
  if (process.env.NODE_ENV !== 'test') {
    startRollupWorker(60000); // Run every 60 seconds
    logger.info('Metrics rollup worker started');
  }

  return httpServer;
}
