import dotenv from "dotenv";

// Load environment variables from .env file FIRST
dotenv.config();

// CRITICAL: Initialize OpenTelemetry BEFORE any other imports
// This ensures auto-instrumentation can hook into all modules
import { initTelemetry } from "./observability/telemetry";
initTelemetry();

import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { log } from "./utils";
import { serveStatic } from "./static";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./logger";
import { sanitizeInputs } from "./utils/sanitize";
import { requestIdMiddleware } from "./middleware/requestId";
import { globalLimiter, authLimiter } from "./middleware/rateLimiting";

const app = express();

// Note: Session and auth setup is handled by setupAuth() in registerRoutes()
// to avoid duplicate middleware registration

// =====================================================================
// 1️⃣ REQUEST ID TRACKING (FIRST - needed for logging)
// =====================================================================
app.use(requestIdMiddleware);

// =====================================================================
// 2️⃣ HELMET SECURITY HEADERS (SECOND - before content processing)
// =====================================================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://accounts.google.com", "https://*.google.com", "https://*.gstatic.com"], // Required for Vite in dev
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com", "https://*.google.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://accounts.google.com", "https://*.googleapis.com", "https://*.google.com", "https://*.gstatic.com", "wss:", "ws:"],
            frameSrc: ["'self'", "https://accounts.google.com", "https://*.google.com"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
    },
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
    },
    frameguard: {
        action: 'deny', // Prevent clickjacking
    },
    noSniff: true, // Prevent MIME type sniffing
    xssFilter: true, // Enable XSS filter
    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
    },
    crossOriginOpenerPolicy: {
        policy: "same-origin-allow-popups",
    },
}));

// =====================================================================
// 3️⃣ CORS CONFIGURATION
// Dynamically determines allowed origins based on environment
const corsOptions = {
    origin: function (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
    ) {
        const isDevelopment = process.env.NODE_ENV === "development";

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
            return callback(null, true);
        }

        // Extract hostname from origin
        let hostname: string;
        try {
            hostname = new URL(origin).hostname;
        } catch (e) {
            return callback(new Error("Invalid origin URL"), false);
        }

        // In development, allow localhost origins
        if (isDevelopment) {
            const allowedPatterns = [
                /^localhost$/,
                /^127\.0\.0\.1$/,
                /^0\.0\.0\.0$/,
            ];

            if (allowedPatterns.some((pattern) => pattern.test(hostname))) {
                return callback(null, true);
            }
        }

        // Allow ezBuildr production domains (explicit)
        // These correspond to the ezBuildr production domains
        if (hostname === "ezbuildr.com" || hostname === "www.ezbuildr.com") {
            return callback(null, true);
        }

        // In production, check against ALLOWED_ORIGIN environment variable
        const allowedOrigin = process.env.ALLOWED_ORIGIN;
        if (allowedOrigin) {
            // Split by comma to support multiple origins
            const allowedHosts = allowedOrigin.split(",").map((h) => h.trim());

            if (allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
                return callback(null, true);
            }
        }

        // Default: deny
        callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));

// =====================================================================
// 4️⃣ PAYLOAD SIZE LIMITS (DoS Protection)
// =====================================================================
const maxRequestSize = process.env.MAX_REQUEST_SIZE || '10mb';
app.use(express.json({ limit: maxRequestSize }));
app.use(express.urlencoded({ extended: false, limit: maxRequestSize }));

// =====================================================================
// 5️⃣ XSS PROTECTION (Input Sanitization)
// =====================================================================
app.use(sanitizeInputs);

// =====================================================================
// 6️⃣ REQUEST TIMEOUT PROTECTION
// =====================================================================
import { requestTimeout } from "./middleware/timeout.js";
app.use(requestTimeout);

// =====================================================================
// 7️⃣ GLOBAL RATE LIMITING (Apply before routes)
// =====================================================================
// Note: This is a baseline. Specific routes may apply stricter limits.
app.use('/api', globalLimiter);

// =====================================================================
// 💡 REQUEST LOGGING MIDDLEWARE
// Logs API requests and responses with timing information
// =====================================================================
// 💡 REQUEST LOGGING MIDDLEWARE
// =====================================================================
import { requestLogger } from "./logger";
app.use(requestLogger);
// =====================================================================


(async () => {
    try {
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
        const { dbInitPromise } = await import("./db.js");
        await dbInitPromise;
        logger.info('Database initialized.');

        // Start Email Queue Worker
        const { emailQueueService } = await import('./services/EmailQueueService.js');
        emailQueueService.startWorker();

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
        const port = parseInt(process.env.PORT || '5000', 10);
        server.listen({
            port,
            host: "0.0.0.0", // Bind to all network interfaces for Railway/Docker
        }, () => {
            log(`serving on port ${port}`);
        });

        // RESOURCE LEAK FIX: Graceful shutdown handlers
        const shutdown = async (signal: string) => {
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

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    } catch (error) {
        logger.fatal({ error }, "FATAL: Failed to start server");
        process.exit(1);
    }
})();

// Export app for testing purposes
export default app;
