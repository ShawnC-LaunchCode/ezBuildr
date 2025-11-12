import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./googleAuth";
import { userRepository } from "./repositories";
import { registerAllRoutes } from "./routes/index";
import { createLogger } from "./logger";
import { initCollabServer, getMetrics, getRoomStats } from "./realtime/collabServer";

const logger = createLogger({ module: 'routes' });

// Extend Express Request type for authenticated requests
declare global {
  namespace Express {
    interface User {
      claims: {
        sub: string;
        email: string;
        [key: string]: any;
      };
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
    }
  }
}

/**
 * Main route registration function
 * Sets up authentication and delegates to modular route handlers
 */
export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  await setupAuth(app);

  // Health check endpoint for Docker health checks and monitoring
  app.get('/api/health', async (req, res) => {
    try {
      // Robust health check - verify database connectivity with lightweight ping
      const isDbHealthy = await userRepository.ping();

      if (!isDbHealthy) {
        return res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Database connection failed'
        });
      }

      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      logger.error({ err: error }, 'Health check failed');
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check error'
      });
    }
  });

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

  logger.info('Real-time collaboration server initialized');

  return httpServer;
}
