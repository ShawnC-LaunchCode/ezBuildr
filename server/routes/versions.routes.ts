import { z } from "zod";
import { classifyRouteError } from '../utils/routeErrors';

import { createLogger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { versionService } from "../services/VersionService";
import { asyncHandler } from "../utils/asyncHandler";

import type { Express, Request, Response } from "express";

const logger = createLogger({ module: "versions-routes" });

// Validation schemas
const publishSchema = z.object({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- workflow graph structure is dynamic
  graphJson: z.any(),
  notes: z.string().optional(),
  force: z.boolean().optional(),
});

const rollbackSchema = z.object({
  toVersionId: z.string().uuid(),
  notes: z.string().optional(),
});

const pinSchema = z.object({
  versionId: z.string().uuid(),
});

/**
 * Register workflow version management routes
 */
export function registerVersionRoutes(app: Express): void {
  /**
   * GET /workflows/:id/versions
   * List all versions for a workflow
   */
  app.get('/api/workflows/:id/versions', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = (req as AuthRequest).userId;

      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized - no user ID" });
      }

      const versions = await versionService.listVersions(id, userId);

      res.json({
        success: true,
        data: versions,
      });
    } catch (error) {
      logger.error({ error, workflowId: req.params.id }, "Error listing versions");
      const __r = classifyRouteError(error, "Failed to list versions");
      res.status(__r.status).json({ success: false, error: __r.message });
    }
  }));

  /**
   * GET /workflowVersions/:versionId/diff/:otherVersionId
   * Get diff between two versions
   */
  app.get('/api/workflowVersions/:versionId/diff/:otherVersionId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { versionId, otherVersionId } = req.params;

      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const diff = await versionService.diffVersions(versionId, otherVersionId, userId);

      res.json({
        success: true,
        data: diff,
      });
    } catch (error) {
      logger.error({ error, versionId: req.params.versionId, otherVersionId: req.params.otherVersionId }, "Error computing diff");
      const __r = classifyRouteError(error, "Failed to compute diff");
      res.status(__r.status).json({ success: false, error: __r.message });
    }
  }));

  /**
   * POST /workflows/:id/publish
   * Publish a new version
   * Body: { graphJson, notes?, force? }
   */
  app.post('/api/workflows/:id/publish', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const data = publishSchema.parse(req.body);

      /* eslint-disable @typescript-eslint/no-unsafe-argument -- graphJson from Zod parse is typed */
      const version = await versionService.publishVersion(
        id,
        userId,
        data.graphJson,
        data.notes,
        data.force
      );
      /* eslint-enable @typescript-eslint/no-unsafe-argument */

      res.json({
        success: true,
        data: version,
      });
    } catch (error) {
      logger.error({ error, workflowId: req.params.id }, "Error publishing version");
      const __r = classifyRouteError(error, "Failed to publish version");
      res.status(__r.status).json({ success: false, error: __r.message });
    }
  }));

  /**
   * POST /workflows/:id/rollback
   * Rollback to a previous version
   * Body: { toVersionId, notes? }
   */
  app.post('/api/workflows/:id/rollback', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const data = rollbackSchema.parse(req.body);

      await versionService.rollbackToVersion(id, data.toVersionId, userId, data.notes);

      res.json({
        success: true,
        message: "Workflow rolled back successfully",
      });
    } catch (error) {
      logger.error({ error, workflowId: req.params.id }, "Error rolling back version");
      const __r = classifyRouteError(error, "Failed to rollback");
      res.status(__r.status).json({ success: false, error: __r.message });
    }
  }));

  /**
   * POST /workflows/:id/pin
   * Pin a specific version
   * Body: { versionId }
   */
  app.post('/api/workflows/:id/pin', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const data = pinSchema.parse(req.body);

      await versionService.pinVersion(id, data.versionId, userId);

      res.json({
        success: true,
        message: "Version pinned successfully",
      });
    } catch (error) {
      logger.error({ error, workflowId: req.params.id }, "Error pinning version");
      const __r = classifyRouteError(error, "Failed to pin version");
      res.status(__r.status).json({ success: false, error: __r.message });
    }
  }));

  /**
   * POST /workflows/:id/unpin
   * Unpin version
   */
  app.post('/api/workflows/:id/unpin', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      await versionService.unpinVersion(id, userId);

      res.json({
        success: true,
        message: "Version unpinned successfully",
      });
    } catch (error) {
      logger.error({ error, workflowId: req.params.id }, "Error unpinning version");
      const message = "Failed to unpin version";
      res.status(500).json({ success: false, error: message });
    }
  }));

  /**
   * GET /workflows/:id/export
   * Export workflow versions as JSON
   */
  app.get('/api/workflows/:id/export', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const exportData = await versionService.exportVersions(id, userId);

      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="workflow-${id}-versions.json"`);

      res.json(exportData);
    } catch (error) {
      logger.error({ error, workflowId: req.params.id }, "Error exporting versions");
      const message = "Failed to export versions";
      res.status(500).json({ success: false, error: message });
    }
  }));
}
