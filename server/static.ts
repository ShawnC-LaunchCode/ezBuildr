import fs from "fs";
import path from "path";

import express, { type Express } from "express";

import { logger } from "./logger";

export function serveStatic(app: Express) {
  // Use process.cwd() instead of import.meta.dirname for bundled code compatibility
  // In production (Railway), cwd is /app and dist/public is the build output
  const distPath = path.resolve(process.cwd(), "dist", "public");

  if (!fs.existsSync(distPath)) {
    // In test mode, static files are not needed (tests only use API routes)
    // Just log a warning and skip static file serving
    if (process.env.NODE_ENV === "test") {
      logger.warn(
        { distPath },
        `[Static] Build directory not found: ${distPath} - skipping static file serving (test mode)`,
      );
      return;
    }

    // In production, this is a critical error
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
