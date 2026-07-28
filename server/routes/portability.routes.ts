import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { exportService } from "../services/portability/ExportService";
import { strictLimiter } from "../middleware/rateLimiter";
import { auditLogService } from "../services/AuditLogService";
import { asyncHandler } from "../utils/asyncHandler";
import { classifyRouteError } from '../utils/routeErrors';
import * as fs from "fs";

import type { Express, Request, Response } from "express";

const logger = createLogger({ module: "portability-routes" });

export function registerPortabilityRoutes(app: Express): void {
  const handleExport = async (req: Request, res: Response, scope: 'workflow' | 'project' | 'database'): Promise<Response | void> => {
    let tmpPathToDelete: string | null = null;
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized - no user ID" });
      }

      const id = req.params.id;
      const result = await exportService.exportToFile({ scope, id }, userId);
      tmpPathToDelete = result.tmpPath;
      
      const { manifest, tenantId } = result;

      // Bundles run to hundreds of MB; stat them off-thread like every other
      // file operation in this path.
      const { size: sizeBytes } = await fs.promises.stat(result.tmpPath);

      // The record that answers "who took a copy of this client's data, and
      // from where" — so it carries the caller's address, not just the actor.
      await auditLogService.logDataExport({
        userId,
        scope,
        rootId: id,
        tenantId,
        entityCounts: manifest.entityCounts,
        blobCount: manifest.blobCount,
        sizeBytes,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="ezbuildr-${scope}-${id}-export.ezb"`);
      
      const stream = fs.createReadStream(result.tmpPath);
      stream.on('close', () => {
        fs.promises.unlink(result.tmpPath).catch(() => {});
      });
      stream.on('error', (error) => {
        logger.error({ error }, "Error streaming export");
        if (!res.headersSent) {
          res.status(500).json({ message: "Error streaming export" });
        }
      });
      stream.pipe(res);

    } catch (error) {
      if (tmpPathToDelete) {
        fs.promises.unlink(tmpPathToDelete).catch(() => {});
      }
      logger.error({ error }, "Error exporting portability bundle");
      const { status, message } = classifyRouteError(error, "Failed to export portability bundle");
      if (!res.headersSent) {
        res.status(status).json({ message });
      }
    }
  };

  // `hybridAuth` before `strictLimiter`, matching the convention for
  // authenticated resource routes (sections.routes.ts:87, steps.routes.ts:120).
  // Limiter-first is for token/public routes that cannot identify a caller.
  // Here it would let anonymous traffic burn the per-IP budget: ten unauthorized
  // requests exhaust the window and every legitimate user behind that IP — an
  // office NAT or VPN — is locked out of exports for 15 minutes.
  app.get('/api/portability/export/workflow/:id', hybridAuth, strictLimiter, asyncHandler(async (req, res) => {
    await handleExport(req, res, 'workflow');
  }));

  app.get('/api/portability/export/project/:id', hybridAuth, strictLimiter, asyncHandler(async (req, res) => {
    await handleExport(req, res, 'project');
  }));

  app.get('/api/portability/export/database/:id', hybridAuth, strictLimiter, asyncHandler(async (req, res) => {
    await handleExport(req, res, 'database');
  }));
}
