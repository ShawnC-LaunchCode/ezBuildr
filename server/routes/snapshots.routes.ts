import { eq } from "drizzle-orm";
import { z } from "zod";

import { workflowRuns } from "@shared/schema";

import { db } from "../db";
import { logger } from "../logger";
import { hybridAuth, type AuthRequest } from '../middleware/auth';
import { snapshotService } from "../services/SnapshotService";
import { workflowService } from "../services/WorkflowService";
import { asyncHandler } from "../utils/asyncHandler";

import type { Express, Request, Response } from "express";

const UNAUTHORIZED_MSG = "Unauthorized - no user ID";

// Zod schemas for request validation
const createSnapshotSchema = z.object({
  name: z.string().min(1).max(255),
});

const renameSnapshotSchema = z.object({
  name: z.string().min(1).max(255),
});

const saveFromRunSchema = z.object({
  runId: z.string().uuid(),
});

/**
 * Register snapshot-related routes
 * Handles snapshot CRUD operations and run value persistence
 */
// eslint-disable-next-line max-lines-per-function
export function registerSnapshotRoutes(app: Express): void {
  /**
   * GET /api/workflows/:workflowId/snapshots
   * Get all snapshots for a workflow
   */
  app.get('/api/workflows/:workflowId/snapshots', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }

      const { workflowId } = req.params;
      
      // Verify workflow access
      await workflowService.verifyAccess(workflowId, userId, 'view');
      
      const snapshots = await snapshotService.getSnapshotsByWorkflowId(workflowId);

      res.json(snapshots);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId }, "Error fetching snapshots");
      
      if (error instanceof Error && (error.message.includes("Access denied") || error.message.includes("not found"))) {
          return res.status(403).json({ message: "Access denied" });
      }
      
      res.status(500).json({
        message: "Failed to fetch snapshots",
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/snapshots/:snapshotId
   * Get a single snapshot by ID
   */
  app.get('/api/workflows/:workflowId/snapshots/:snapshotId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }

      const { workflowId, snapshotId } = req.params;
      
      // Verify workflow access
      await workflowService.verifyAccess(workflowId, userId, 'view');
      
      const snapshot = await snapshotService.getSnapshotById(snapshotId);

      if (!snapshot || snapshot.workflowId !== workflowId) {
        return res.status(404).json({ message: "Snapshot not found" });
      }

      res.json(snapshot);
    } catch (error) {
      logger.error({ error, snapshotId: req.params.snapshotId }, "Error fetching snapshot");
      
      if (error instanceof Error && (error.message.includes("Access denied") || error.message.includes("not found"))) {
          return res.status(403).json({ message: "Access denied" });
      }
      
      res.status(500).json({
        message: "Failed to fetch snapshot",
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  }));

  /**
   * POST /api/workflows/:workflowId/snapshots
   * Create a new snapshot (empty values)
   */
  app.post('/api/workflows/:workflowId/snapshots', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }

      const { workflowId } = req.params;
      
      // Verify workflow access
      await workflowService.verifyAccess(workflowId, userId, 'edit');
      
      const { name } = createSnapshotSchema.parse(req.body);

      const snapshot = await snapshotService.createSnapshot(workflowId, name);
      res.status(201).json(snapshot);
    } catch (error) {
      logger.error({ error, workflowId: req.params.workflowId }, "Error creating snapshot");

      if (error instanceof Error && (error.message.includes("Access denied") || error.message.includes("not found"))) {
          return res.status(403).json({ message: "Access denied" });
      }

      if (error instanceof Error && error.message.includes("already exists")) {
        return res.status(409).json({ message: error.message });
      }

      res.status(500).json({
        message: "Failed to create snapshot",
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  }));

  /**
   * PUT /api/workflows/:workflowId/snapshots/:snapshotId
   * Rename a snapshot
   */
  app.put('/api/workflows/:workflowId/snapshots/:snapshotId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }

      const { workflowId, snapshotId } = req.params;
      
      // Verify workflow access
      await workflowService.verifyAccess(workflowId, userId, 'edit');
      
      const existingSnapshot = await snapshotService.getSnapshotById(snapshotId);
      if (!existingSnapshot || existingSnapshot.workflowId !== workflowId) {
        return res.status(404).json({ message: "Snapshot not found" });
      }
      
      const { name } = renameSnapshotSchema.parse(req.body);

      const snapshot = await snapshotService.renameSnapshot(snapshotId, name);
      res.json(snapshot);
    } catch (error) {
      logger.error({ error, snapshotId: req.params.snapshotId }, "Error renaming snapshot");

      if (error instanceof Error && (error.message.includes("Access denied") || error.message.includes("not found"))) {
          return res.status(403).json({ message: "Access denied" });
      }

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          return res.status(404).json({ message: error.message });
        }
        if (error.message.includes("already exists")) {
          return res.status(409).json({ message: error.message });
        }
      }

      res.status(500).json({
        message: "Failed to rename snapshot",
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  }));

  /**
   * DELETE /api/workflows/:workflowId/snapshots/:snapshotId
   * Delete a snapshot
   */
  app.delete('/api/workflows/:workflowId/snapshots/:snapshotId', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }

      const { workflowId, snapshotId } = req.params;
      
      // Verify workflow access
      await workflowService.verifyAccess(workflowId, userId, 'edit');
      
      const snapshot = await snapshotService.getSnapshotById(snapshotId);
      if (!snapshot || snapshot.workflowId !== workflowId) {
        return res.status(404).json({ message: "Snapshot not found" });
      }

      await snapshotService.deleteSnapshot(snapshotId);

      res.status(204).send();
    } catch (error) {
      logger.error({ error, snapshotId: req.params.snapshotId }, "Error deleting snapshot");

      if (error instanceof Error && (error.message.includes("Access denied") || error.message.includes("not found"))) {
          return res.status(403).json({ message: "Access denied" });
      }

      if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({ message: error.message });
      }

      res.status(500).json({
        message: "Failed to delete snapshot",
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  }));

  /**
   * POST /api/workflows/:workflowId/snapshots/:snapshotId/save-from-run
   * Save current run values to snapshot (versioned)
   */
  app.post('/api/workflows/:workflowId/snapshots/:snapshotId/save-from-run', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }

      const { workflowId, snapshotId } = req.params;
      const { runId } = saveFromRunSchema.parse(req.body);
      
      // Verify workflow access
      await workflowService.verifyAccess(workflowId, userId, 'edit');
      
      const existingSnapshot = await snapshotService.getSnapshotById(snapshotId);
      if (!existingSnapshot || existingSnapshot.workflowId !== workflowId) {
        return res.status(404).json({ message: "Snapshot not found" });
      }

      const [run] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
      if (!run || run.workflowId !== workflowId) {
        return res.status(404).json({ message: "Run not found" });
      }

      const snapshot = await snapshotService.saveFromRun(snapshotId, runId);
      res.json(snapshot);
    } catch (error) {
      logger.error({ error, snapshotId: req.params.snapshotId }, "Error saving run to snapshot");

      if (error instanceof Error && (error.message.includes("Access denied") || error.message.includes("not found"))) {
          return res.status(403).json({ message: "Access denied" });
      }

      if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({ message: error.message });
      }

      res.status(500).json({
        message: "Failed to save run to snapshot",
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/snapshots/:snapshotId/values
   * Get snapshot values as simple key-value map
   */
  app.get('/api/workflows/:workflowId/snapshots/:snapshotId/values', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }

      const { workflowId, snapshotId } = req.params;
      
      // Verify workflow access
      await workflowService.verifyAccess(workflowId, userId, 'view');
      
      const snapshot = await snapshotService.getSnapshotById(snapshotId);
      if (!snapshot || snapshot.workflowId !== workflowId) {
        return res.status(404).json({ message: "Snapshot not found" });
      }

      const values = await snapshotService.getSnapshotValues(snapshotId);

      res.json(values);
    } catch (error) {
      logger.error({ error, snapshotId: req.params.snapshotId }, "Error fetching snapshot values");

      if (error instanceof Error && (error.message.includes("Access denied") || error.message.includes("not found"))) {
          return res.status(403).json({ message: "Access denied" });
      }

      if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({ message: error.message });
      }

      res.status(500).json({
        message: "Failed to fetch snapshot values",
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  }));

  /**
   * GET /api/workflows/:workflowId/snapshots/:snapshotId/validate
   * Validate if snapshot values are still current with workflow
   */
  app.get('/api/workflows/:workflowId/snapshots/:snapshotId/validate', hybridAuth, asyncHandler(async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) {
        return res.status(401).json({ message: UNAUTHORIZED_MSG });
      }

      const { workflowId, snapshotId } = req.params;
      
      // Verify workflow access
      await workflowService.verifyAccess(workflowId, userId, 'view');
      
      const snapshot = await snapshotService.getSnapshotById(snapshotId);
      if (!snapshot || snapshot.workflowId !== workflowId) {
        return res.status(404).json({ message: "Snapshot not found" });
      }

      const validation = await snapshotService.validateSnapshot(snapshotId);

      res.json(validation);
    } catch (error) {
      logger.error({ error, snapshotId: req.params.snapshotId }, "Error validating snapshot");

      if (error instanceof Error && (error.message.includes("Access denied") || error.message.includes("not found"))) {
          return res.status(403).json({ message: "Access denied" });
      }

      if (error instanceof Error && error.message.includes("not found")) {
        return res.status(404).json({ message: error.message });
      }

      res.status(500).json({
        message: "Failed to validate snapshot",
        error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined,
      });
    }
  }));
}
