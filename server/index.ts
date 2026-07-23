import dotenv from "dotenv";
// Load environment variables from .env file FIRST
dotenv.config();
// CRITICAL: Initialize OpenTelemetry BEFORE any other imports
// This ensures auto-instrumentation can hook into all modules
import express from "express";
import { applySecurityMiddleware } from "./middleware/securityConfig";

import { logger } from "./logger";
import { errorHandler } from "./middleware/errorHandler";
import { globalLimiter } from "./middleware/rateLimiting";
import { requestIdMiddleware } from "./middleware/requestId";
import { requestTimeout } from "./middleware/timeout.js";
import { initTelemetry } from "./observability/telemetry";

initTelemetry();
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { log as _log } from "./utils";
import { sanitizeInputs } from "./utils/sanitize";
const app = express();
// Note: Session and auth setup is handled by setupAuth() in registerRoutes()
// to avoid duplicate middleware registration
// =====================================================================
// 1️⃣ REQUEST ID TRACKING (FIRST - needed for logging)
// =====================================================================
app.use(requestIdMiddleware);
// =====================================================================
// 2️⃣ SECURITY HEADERS, CORS, & PAYLOAD LIMITS
// =====================================================================
applySecurityMiddleware(app);
// =====================================================================
// 5️⃣ XSS PROTECTION (Input Sanitization)
// =====================================================================
app.use(sanitizeInputs);
// =====================================================================
// 6️⃣ REQUEST TIMEOUT PROTECTION
// =====================================================================
app.use(requestTimeout);
// =====================================================================
// 7️⃣ GLOBAL RATE LIMITING (Apply before routes)
// =====================================================================
// Note: This is a baseline. Specific routes may apply stricter limits.
// SECURITY: rate limiting must also cover the public/unauthenticated surfaces, which are
// mounted outside /api. Without this, /intake/* (incl. file upload and slug enumeration),
// /public/* and the portal were completely unthrottled — open to abuse, disk-fill and DoS.
app.use('/api', globalLimiter);
app.use('/intake', globalLimiter);
app.use('/public', globalLimiter);
app.use('/oauth', globalLimiter);
// eslint-disable-next-line sonarjs/cognitive-complexity -- server bootstrap is inherently complex
void (async () => {
    try {
        // Swagger UI (/api-docs) is mounted by registerDocsRoutes() via registerRoutes(),
        // which applies the production/ENABLE_API_DOCS gate and the configured UI options.
        // CONFIGURATION FIX: Validate master key at startup (fail fast if misconfigured)
        const { validateMasterKey } = await import("./utils/encryption.js");
        try {
            validateMasterKey();
            logger.info('Master key validated successfully');
        } catch (error) {
            logger.fatal({ error }, 'FATAL: VL_MASTER_KEY is not properly configured');
            logger.fatal('Please ensure VL_MASTER_KEY is set to a valid base64-encoded 32-byte key');
            logger.fatal('Generate a new key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
            process.exit(1);
        }
        // CONFIGURATION CHECK: Validate AI provider configuration
        const { validateAIConfig } = await import("./services/AIService.js");
        const aiConfig = validateAIConfig();
        if (aiConfig.configured) {
            logger.info({ provider: aiConfig.provider, model: aiConfig.model }, 'AI Service configured and ready');
        } else {
            logger.warn({ error: aiConfig.error }, 'AI Service not configured - AI features will be unavailable');
            logger.warn('To enable AI features, set GEMINI_API_KEY or AI_API_KEY environment variable');
            logger.warn('Get your key at: https://makersuite.google.com/app/apikey (Gemini) or https://platform.openai.com/api-keys (OpenAI)');
        }
        // Ensure database is initialized before starting server
        logger.info('Initializing database...');
        const { dbInitPromise, initializeDatabase } = await import("./db.js");
        await dbInitPromise;
        // The real server process must connect the DB even under NODE_ENV=test
        // (the `dev:test` mode Playwright's webServer launches), where db.ts skips
        // auto-init to protect Vitest's per-worker schema setup. initializeDatabase
        // is idempotent, so this is a no-op in dev/prod. Vitest never runs this file.
        await initializeDatabase();
        logger.info('Database initialized.');
        // Start Email Queue Worker
        const { emailQueueService } = await import('./services/EmailQueueService.js');
        emailQueueService.startWorker();
        const { runCompletionJobWorker } = await import('./services/workflow-runs/RunCompletionJobWorker.js');
        runCompletionJobWorker.start();
        // Initialize Cron Jobs
        const { initCronJobs } = await import('./cron.js');
        initCronJobs();
        // Initialize routes and collaboration server
        logger.debug('Registering routes...');
        const server = await registerRoutes(app);
        logger.debug('Routes registered. Server created.');
        // Register centralized error handler middleware (must be after all routes)
        app.use(errorHandler);
        // importantly only setup vite in development and test modes and after
        // setting up all the other routes so the catch-all route
        // doesn't interfere with the other routes
        if (app.get("env") === "development" || app.get("env") === "test") {
            // Dynamic import vite only in development and test to avoid bundling it
            try {
                logger.info("Loading Vite for development...");
                const { setupVite } = await import("./vite.js");
                logger.info("Vite module loaded, calling setupVite...");
                await setupVite(app, server);
                logger.info("Vite setup complete");
            } catch (error) {
                logger.error({ error, message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, "Failed to load vite (this is expected in production)");
                // Fallback to static serving if vite module is not available
                serveStatic(app);
            }
        } else {
            serveStatic(app);
        }
        // ALWAYS serve the app on the port specified in the environment variable PORT
        // Other ports are firewalled. Default to 5000 if not specified.
        // this serves both the API and the client.
        // It is the only port that is not firewalled.
        const port = parseInt(process.env.PORT ?? '5000', 10);
        server.listen({
            port,
            host: "0.0.0.0", // Bind to all network interfaces for Railway/Docker
        }, () => {
            logger.warn(`serving on port ${port}`);
        });
        // RESOURCE LEAK FIX: Graceful shutdown handlers
        const shutdown = async (signal: string): Promise<void> => {
            logger.info({ signal }, 'Shutdown signal received, cleaning up...');
            // Shutdown OpenTelemetry
            const { shutdownTelemetry } = await import('./observability/telemetry.js');
            await shutdownTelemetry();
            // Clean up OAuth2 state cleanup interval
            const { stopOAuth2StateCleanup } = await import('./services/oauth2.js');
            stopOAuth2StateCleanup();
            // Stop Email Queue Worker
            const { emailQueueService } = await import('./services/EmailQueueService.js');
            emailQueueService.stopWorker();
            const { runCompletionJobWorker } = await import('./services/workflow-runs/RunCompletionJobWorker.js');
            runCompletionJobWorker.stop();
            // Close server
            server.close(() => {
                logger.info('Server closed successfully');
                process.exit(0);
            });
            // Force exit after timeout
            setTimeout(() => {
                logger.error('Forced shutdown after timeout');
                process.exit(1);
            }, 10000);
        };
        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- shutdown returns promise, but process.on expects void
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- shutdown returns promise, but process.on expects void
        process.on('SIGINT', () => shutdown('SIGINT'));
    } catch (error) {
        logger.fatal({ error }, "FATAL: Failed to start server");
        process.exit(1);
    }
})();
// Export app for testing purposes
export default app;
