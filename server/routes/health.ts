import { sql } from 'drizzle-orm';
import { Router, Request, Response } from 'express';

import { db } from '../db';
import { logger } from '../logger';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * Health Check Endpoint
 *
 * GET /health
 *
 * Returns service health status, database connectivity, and system metadata.
 * Used by monitoring systems, load balancers, and deployment orchestrators.
 *
 * Response Format:
 * {
 *   status: 'healthy' | 'degraded' | 'unhealthy',
 *   timestamp: ISO 8601 timestamp,
 *   uptime: process uptime in seconds,
 *   version: service version from package.json,
 *   environment: NODE_ENV value,
 *   database: {
 *     connected: boolean,
 *     responseTime: milliseconds
 *   }
 * }
 */

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  database: {
    connected: boolean;
    responseTime?: number;
    error?: string;
  };
  requestId?: string;
}

router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const healthCheck: HealthCheckResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV ?? 'development',
    database: {
      connected: false,
    },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Express request augmented with id
    requestId: (req as any).id,
  };

  try {
    // Check database connectivity with simple query
    const dbCheckStart = Date.now();
    await db.execute(sql`SELECT 1 as health_check`);
    const dbCheckEnd = Date.now();

    healthCheck.database.connected = true;
    healthCheck.database.responseTime = dbCheckEnd - dbCheckStart;

    // If database response time is slow (>1000ms), mark as degraded
    if (healthCheck.database.responseTime > 1000) {
      healthCheck.status = 'degraded';
    }
  } catch (error) {
    // Database connection failed. Do NOT leak the raw DB error (which can disclose
    // connection strings / internal hostnames) to unauthenticated callers; log it server-side.
    logger.error({ err: error }, 'Health check: database connectivity failed');
    healthCheck.status = 'unhealthy';
    healthCheck.database.connected = false;
    healthCheck.database.error = 'Database connectivity check failed';
  }

  // Set appropriate HTTP status code
  const statusCode = healthCheck.status === 'healthy' ? 200 :
    healthCheck.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(healthCheck);
}));

/**
 * Readiness Check Endpoint
 *
 * GET /ready
 *
 * Similar to /health but specifically for Kubernetes/container orchestration.
 * Only returns 200 if the service is fully ready to accept traffic.
 */
router.get('/ready', asyncHandler(async (_req: Request, res: Response) => {
  try {
    // Check database connectivity
    await db.execute(sql`SELECT 1 as ready_check`);

    res.status(200).json({
      ready: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Log details server-side; return a generic reason to avoid leaking internals.
    logger.error({ err: error }, 'Readiness check: database connectivity failed');
    res.status(503).json({
      ready: false,
      timestamp: new Date().toISOString(),
      error: 'Service not ready',
    });
  }
}));

/**
 * Liveness Check Endpoint
 *
 * GET /live
 *
 * Simple liveness probe for container orchestration.
 * Returns 200 if the process is running, regardless of dependencies.
 */
router.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    alive: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
