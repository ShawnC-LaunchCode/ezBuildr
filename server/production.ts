import { applySecurityMiddleware } from "./middleware/securityConfig";

import { logger } from "./logger";
import { errorHandler } from "./middleware/errorHandler";
import { globalLimiter } from "./middleware/rateLimiting";
import { requestIdMiddleware } from "./middleware/requestId";
import { requestTimeout } from "./middleware/timeout";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { log } from "./utils";
import { sanitizeInputs } from "./utils/sanitize";

import express from "express";
import dotenv from "dotenv";
// Load environment variables
dotenv.config();
// Diagnostic logging for startup
logger.info("------------------------------------------");
logger.info("🚀 Starting Server Initialization");
logger.info({ time: new Date().toISOString() }, "Server start time");
logger.info({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL_SET: !!process.env.DATABASE_URL,
  PWD: process.cwd()
}, "Environment configuration");
logger.info("------------------------------------------");
const app = express();

// =====================================================================
// 1️⃣ REQUEST ID TRACKING (FIRST - needed for logging)
// =====================================================================
app.use(requestIdMiddleware);

// =====================================================================
// 2️⃣ SECURITY HEADERS, CORS, & PAYLOAD LIMITS
// =====================================================================
applySecurityMiddleware(app);
// Simple health check that doesn't depend on DB
app.get('/healthz', (_req, res) => {
  logger.debug({ ip: _req.ip }, 'Healthz check received');
  res.status(200).send('OK');
});
// XSS Protection: Sanitize all string inputs
app.use(sanitizeInputs);

// =====================================================================
// 6️⃣ REQUEST TIMEOUT PROTECTION
// =====================================================================
app.use(requestTimeout);

// =====================================================================
// 7️⃣ GLOBAL RATE LIMITING (Apply before routes)
// =====================================================================
app.use('/api', globalLimiter);
app.use('/intake', globalLimiter);
app.use('/public', globalLimiter);
app.use('/oauth', globalLimiter);
// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
  try {
    // Validate master key at startup (fail fast if misconfigured)
    const { validateMasterKey } = await import("./utils/encryption.js");
    try {
      validateMasterKey();
      logger.info('Master key validated successfully');
    } catch (error) {
      logger.fatal({ error }, 'FATAL: VL_MASTER_KEY is not properly configured');
      process.exit(1);
    }

    // Ensure database is initialized before starting server
    // Using dynamic import to avoid DB connection side-effects before key check
    const { dbInitPromise } = await import("./db.js");
    await dbInitPromise;
    const { initializeEsignProviders } = await import('./services/esign/index.js');
    initializeEsignProviders();
    // Initialize routes and collaboration server
    // CRITICAL: We MUST use the 'server' returned by registerRoutes, as it has the WebSocket instance attached.

    logger.info('Registering routes...');
    const server = await registerRoutes(app);
    logger.info('Routes registered. Server created.');
    
    // Start Email Queue Worker
    const { emailQueueService } = await import('./services/EmailQueueService.js');
    emailQueueService.startWorker();
    const { runCompletionJobWorker } = await import('./services/workflow-runs/RunCompletionJobWorker.js');
    runCompletionJobWorker.start();
    const { documentDeliveryService } = await import('./services/document/delivery/DocumentDeliveryService.js');
    documentDeliveryService.startWorker();
    
    // Initialize Cron Jobs
    const { initCronJobs } = await import('./cron.js');
    initCronJobs();
    // Register centralized error handler middleware (must be after all routes)
    app.use(errorHandler);
    // Serve static files in production
    // Wrap in try-catch so one missing folder doesn't crash the whole API
    try {
      serveStatic(app);
    } catch (err: unknown) {
      logger.error({ err }, "Failed to serve static files (continuing to allow API access)");
    }
    // Start server
    const port = parseInt(process.env.PORT ?? '5000', 10);
    server.listen({
      port,
      host: "0.0.0.0", // Bind to all network interfaces for Railway/Docker
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);
    });

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      logger.info({ signal }, 'Shutdown signal received, cleaning up...');

      emailQueueService.stopWorker();
      runCompletionJobWorker.stop();
      documentDeliveryService.stopWorker();
      const { stopOAuth2StateCleanup } = await import('./services/oauth2.js');
      stopOAuth2StateCleanup();
      const { shutdownTelemetry } = await import('./observability/telemetry.js');
      await shutdownTelemetry();

      server.close(() => {
        logger.info('Server closed successfully');
        process.exit(0);
      });
      const forceExitTimer = setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10_000);
      forceExitTimer.unref();
    };

    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('SIGINT', () => { void shutdown('SIGINT'); });
  } catch (error) {
    logger.fatal({ error }, "FATAL: Failed to start server");
    process.exit(1);
  }
})();
