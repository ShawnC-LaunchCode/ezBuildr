import { createServer } from "http";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { log } from "./utils";
import { serveStatic } from "./static";
import { logger } from "./logger";
import { sanitizeInputs } from "./utils/sanitize";
import { errorHandler } from "./middleware/errorHandler";
import dotenv from "dotenv";
import { dbInitPromise } from "./db";

// Load environment variables
dotenv.config();

// Diagnostic logging for startup
console.log("------------------------------------------");
console.log("🚀 Starting Server Initialization");
console.log("Time:", new Date().toISOString());
console.log("Environment:", {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL_SET: !!process.env.DATABASE_URL,
  PWD: process.cwd()
});
console.log("------------------------------------------");

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
app.get('/healthz', (_req, res) => res.status(200).send('OK'));

// XSS Protection: Sanitize all string inputs
app.use(sanitizeInputs);

(async () => {
  try {
    // Ensure database is initialized before starting server
    // Using static import to ensure correct bundling in production
    await dbInitPromise;

    // Initialize routes and collaboration server
    // CRITICAL: We MUST use the 'server' returned by registerRoutes, as it has the WebSocket instance attached.
    console.log('[DEBUG] Registering routes...');
    const server = await registerRoutes(app);
    console.log('[DEBUG] Routes registered. Server created.');

    // Register centralized error handler middleware (must be after all routes)
    app.use(errorHandler);

    // Serve static files in production
    // Wrap in try-catch so one missing folder doesn't crash the whole API
    try {
      serveStatic(app);
    } catch (err: any) {
      logger.error({ err }, "Failed to serve static files (continuing to allow API access)");
      console.error("WARNING: Failed to serve static files:", err.message);
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
    console.error("FATAL: Failed to start server:", error);
    logger.fatal({ error }, "FATAL: Failed to start server");
    process.exit(1);
  }
})();
