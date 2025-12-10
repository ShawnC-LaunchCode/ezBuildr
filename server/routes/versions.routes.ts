import type { Express, Request, Response } from "express";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { versionService } from "../services/VersionService";
import { z } from "zod";
import { createLogger } from "../logger";

const logger = createLogger({ module: "versions-routes" });

// Validation schemas
const publishSchema = z.object({
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
  app.get('/api/workflows/:id/versions', hybridAuth, async (req: Request, res: Response) => {
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
      const message = error instanceof Error ? error.message : "Failed to list versions";
      const status = message.includes("Access denied") ? 403 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * GET /workflowVersions/:versionId/diff/:otherVersionId
   * Get diff between two versions
   */
  app.get('/api/workflowVersions/:versionId/diff/:otherVersionId', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { versionId, otherVersionId } = req.params;

      const diff = await versionService.diffVersions(versionId, otherVersionId);

      res.json({
        success: true,
        data: diff,
      });
    } catch (error) {
      logger.error({ error, versionId: req.params.versionId, otherVersionId: req.params.otherVersionId }, "Error computing diff");
      const message = error instanceof Error ? error.message : "Failed to compute diff";
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * POST /workflows/:id/publish
   * Publish a new version
   * Body: { graphJson, notes?, force? }
   */
  app.post('/api/workflows/:id/publish', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authReq = req as AuthRequest;
      const userId = authReq.userId;

      if (!userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const data = publishSchema.parse(req.body);

      const version = await versionService.publishVersion(
        id,
        userId,
        data.graphJson,
        data.notes,
        data.force
      );

      res.json({
        success: true,
        data: version,
      });
    } catch (error) {
      logger.error({ error, workflowId: req.params.id }, "Error publishing version");
      const message = error instanceof Error ? error.message : "Failed to publish version";
      const status = message.includes("Validation failed") ? 400 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * POST /workflows/:id/rollback
   * Rollback to a previous version
   * Body: { toVersionId, notes? }
   */
  app.post('/api/workflows/:id/rollback', hybridAuth, async (req: Request, res: Response) => {
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
      const message = error instanceof Error ? error.message : "Failed to rollback";
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * POST /workflows/:id/pin
   * Pin a specific version
   * Body: { versionId }
   */
  app.post('/api/workflows/:id/pin', hybridAuth, async (req: Request, res: Response) => {
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
      const message = error instanceof Error ? error.message : "Failed to pin version";
      const status = message.includes("not found") ? 404 : 500;
      res.status(status).json({ success: false, error: message });
    }
  });

  /**
   * POST /workflows/:id/unpin
   * Unpin version
   */
  app.post('/api/workflows/:id/unpin', hybridAuth, async (req: Request, res: Response) => {
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
      const message = error instanceof Error ? error.message : "Failed to unpin version";
      res.status(500).json({ success: false, error: message });
    }
  });

  /**
   * GET /workflows/:id/export
   * Export workflow versions as JSON
   */
  app.get('/api/workflows/:id/export', hybridAuth, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const exportData = await versionService.exportVersions(id);

      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="workflow-${id}-versions.json"`);

      res.json(exportData);
    } catch (error) {
      logger.error({ error, workflowId: req.params.id }, "Error exporting versions");
      const message = error instanceof Error ? error.message : "Failed to export versions";
      res.status(500).json({ success: false, error: message });
    }
  });
}
