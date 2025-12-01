/**
 * File Routes
 *
 * Handles serving of generated output files (documents, PDFs, etc.)
 *
 * Legacy survey file upload functionality was removed in November 2025.
 * File uploads for workflows are now handled through workflow step values.
 */

import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import path from "path";
import fs from "fs";
import { createLogger } from "../logger";
import { workflowRunRepository } from "../repositories";
import { createError } from "../utils/errors";

const logger = createLogger({ module: "file-routes" });

/**
 * Register file serving routes
 */
export function registerFileRoutes(app: Express): void {
  const outputsDir = path.join(process.cwd(), 'server', 'files', 'outputs');

  // Secure download endpoint
  // GET /api/files/download/:filename
  app.get('/api/files/download/:filename', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { filename } = req.params;

      // Basic path traversal protection
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw createError.badRequest('Invalid filename');
      }

      const filePath = path.join(outputsDir, filename);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw createError.notFound('File', filename);
      }

      // TODO: Add strict ownership check here
      // For now, we rely on the runToken/session check in the API that provides the link
      // But ideally, we should verify that the current user/token has access to the run 
      // that generated this file.
      // Since filenames contain timestamps and are hard to guess, this is "better" than static hosting
      // but not fully secure yet without a database lookup to map filename -> runId -> userId.

      // For this iteration, we at least prevent directory listing and ensure it's a valid file.
      // The next step would be to look up the file in runGeneratedDocumentsRepository 
      // and verify the current user has access to the associated run.

      // Set headers
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      if (filename.endsWith('.docx')) {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      } else if (filename.endsWith('.pdf')) {
        res.setHeader('Content-Type', 'application/pdf');
      }

      // Stream file
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);

      logger.info({ filename }, 'Serving secure file download');
    } catch (error) {
      next(error);
    }
  });

  logger.info({ outputsDir }, 'Secure file routes registered');
}
