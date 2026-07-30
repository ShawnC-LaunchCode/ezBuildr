import fs from "fs";
import { type Server } from "http";
import path from "path";
import { fileURLToPath } from "url";

import  { type Express } from "express";
import { nanoid } from "nanoid";
import { createServer as createViteServer, createLogger, type ViteDevServer } from "vite";

import viteConfig from "../vite.config";

import { log } from "./utils";
// Get __dirname equivalent in ESM
// eslint-disable-next-line @typescript-eslint/naming-convention -- Node.js ESM __filename convention
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/naming-convention -- Node.js ESM __dirname convention
const __dirname = path.dirname(__filename);
const viteLogger = createLogger();
// Log module load
log("📦 vite.ts module loaded successfully");
export async function setupVite(app: Express, server: Server): Promise<void> {
  log("📝 setupVite: Starting Vite setup...");
  // Resolve vite config (it's a function that needs to be called)
  log("📝 setupVite: Resolving Vite config...");
  const resolvedConfig = typeof viteConfig === 'function'
    ? viteConfig({ mode: process.env.NODE_ENV ?? 'development', command: 'serve', isSsrBuild: false, isPreview: false })
    : viteConfig;
  log("📝 setupVite: Vite config resolved");
  const serverOptions = {
    ...resolvedConfig.server,
    middlewareMode: true,
    allowedHosts: true as const,
  };
  log("📝 setupVite: Server options prepared, creating Vite server...");
  // Create a timeout promise to prevent indefinite hanging
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Vite server creation timed out after 30s")), 30000);
  });
  const vitePromise = createViteServer({
    ...resolvedConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        // Log the error but don't kill the server process
        // Vite will recover from most errors automatically
        viteLogger.error(msg, options);
      },
    },
    server: {
      ...serverOptions,
      hmr: {
        ...(typeof resolvedConfig.server?.hmr === 'object' ? resolvedConfig.server.hmr : {}),
        server,
      },
    },
    appType: "custom",
  });
  const result = await Promise.race([vitePromise, timeout]);
  if (!result || typeof result !== 'object' || !('middlewares' in result)) {
    throw new Error('Failed to create Vite server - timeout or invalid result');
  }
  const vite = result as ViteDevServer;
  log("📝 setupVite: Vite server created successfully");
  log("📝 setupVite: Mounting Vite middlewares...");
  app.use(vite.middlewares);
  log("📝 setupVite: Vite middlewares mounted");
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    // Skip API routes - let them be handled by Express routes
    if (url.startsWith("/api")) {
      return next();
    }
    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );
      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);

      res.status(200).set({ 'Content-Type': 'text/html' }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
  log("📝 setupVite: Vite setup complete!");
}