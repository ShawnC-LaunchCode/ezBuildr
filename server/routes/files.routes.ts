/**
 * File Routes
 *
 * Handles serving of generated output files (documents, PDFs, etc.)
 *
 * Legacy survey file upload functionality was removed in November 2025.
 * File uploads for workflows are now handled through workflow step values.
 */

import fs from "fs";
import path from "path";

import { eq, and } from "drizzle-orm";
import express from "express";

import { runGeneratedDocuments, workflows } from "@shared/schema";

import { db } from "../db";
import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from "../middleware/auth";
import { workflowRunRepository } from "../repositories";
import { aclService } from "../services/AclService";
import { createError } from "../utils/errors";



import type { Express, Request, Response, NextFunction } from "express";

const logger = createLogger({ module: "file-routes" });

/**
 * Register file serving routes
 */
export function registerFileRoutes(app: Express): void {
  const outputsDir = path.join(process.cwd(), 'server', 'files', 'outputs');

  // Secure download endpoint with authorization
  // GET /api/files/download/:filename
  app.get('/api/files/download/:filename', hybridAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { filename } = req.params;
      const userId = req.userId;

      if (!userId) {
        throw createError.unauthorized('Authentication required to download files');
      }

      // Basic path traversal protection
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw createError.badRequest('Invalid filename');
      }

      const filePath = path.join(outputsDir, filename);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw createError.notFound('File', filename);
      }

      // SECURITY FIX: Verify user has access to this document
      // Look up document in database and verify ownership/access
      const documentRecord = await db.query.runGeneratedDocuments.findFirst({
        where: eq(runGeneratedDocuments.fileUrl, filename)
      });

      if (!documentRecord) {
        logger.warn({ filename, userId }, 'Document not found in database');
        throw createError.notFound('File', filename);
      }

      // Verify user has access to the run that generated this document
      const run = await workflowRunRepository.findById(documentRecord.runId);

      if (!run) {
        logger.warn({ filename, runId: documentRecord.runId, userId }, 'Run not found for document');
        throw createError.notFound('File', filename);
      }

      // Check if user owns the run or has access to the workflow
      const userOwnsRun = run.createdBy === userId || run.createdBy === `creator:${userId}`;

      if (!userOwnsRun) {
        // Check if user has access to the workflow
        const workflow = await db.query.workflows.findFirst({
          where: eq(workflows.id, run.workflowId)
        });

        if (!workflow) {
          throw createError.forbidden('Access denied to this file');
        }

        // Check ACL permissions
        if (!workflow.projectId) {
          if (workflow.creatorId !== userId) {
            throw createError.forbidden('Access denied to unfiled workflow');
          }
        } else {
          const hasAccess = await aclService.hasProjectRole(userId, workflow.projectId, 'view');
          if (!hasAccess) {
            logger.warn({ filename, userId, runId: run.id, workflowId: run.workflowId }, 'User lacks access to file');
            throw createError.forbidden('Access denied to this file');
          }
        }
      }

      logger.info({ filename, userId, runId: run.id }, 'Authorized file download');

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
