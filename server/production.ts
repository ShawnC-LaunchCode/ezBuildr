import cors from "cors";
import dotenv from "dotenv";
import express, { type    } from "express";
import { dbInitPromise } from "./db";
import { logger } from "./logger";
import { errorHandler } from "./middleware/errorHandler";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { log } from "./utils";
import { sanitizeInputs } from "./utils/sanitize";
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
// 💡 CORS CONFIGURATION
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
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Simple health check that doesn't depend on DB
app.get('/healthz', (_req, res) => {
  logger.debug({ ip: _req.ip }, 'Healthz check received');
  res.status(200).send('OK');
});
// XSS Protection: Sanitize all string inputs
app.use(sanitizeInputs);
(async () => {
  try {
    // Ensure database is initialized before starting server
    // Using static import to ensure correct bundling in production
    await dbInitPromise;
    // Initialize routes and collaboration server
    // CRITICAL: We MUST use the 'server' returned by registerRoutes, as it has the WebSocket instance attached.
    logger.info('Registering routes...');
    const server = await registerRoutes(app);
    logger.info('Routes registered. Server created.');
    // Register centralized error handler middleware (must be after all routes)
    app.use(errorHandler);
    // Serve static files in production
    // Wrap in try-catch so one missing folder doesn't crash the whole API
    try {
      serveStatic(app);
    } catch (err: any) {
      logger.error({ err }, "Failed to serve static files (continuing to allow API access)");
    }
    // Start server
    const port = parseInt(process.env.PORT || '5000', 10);
    server.listen({
      port,
      host: "0.0.0.0", // Bind to all network interfaces for Railway/Docker
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);
    });
  } catch (error) {
    logger.fatal({ error }, "FATAL: Failed to start server");
    process.exit(1);
  }
})();