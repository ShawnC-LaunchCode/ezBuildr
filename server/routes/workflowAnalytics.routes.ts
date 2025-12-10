/**
 * Workflow Analytics API Routes (Stage 11 + Stage 15)
 *
 * Endpoints for accessing metrics, rollups, SLI data, and new event-based analytics.
 */

import type { Express } from 'express';
import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware';
import { db } from '../db';
import {
  metricsEvents,
  metricsRollups,
} from '../../shared/schema';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import sli from '../services/sli';
import logger from '../logger';

// New Analytics Services
import { analyticsService } from '../services/analytics/AnalyticsService';
import { dropoffService } from '../services/analytics/DropoffService';
import { heatmapService } from '../services/analytics/HeatmapService';
import { branchingService } from '../services/analytics/BranchingService';

const router = express.Router();

// ===================================================================
// SCHEMAS
// ===================================================================

const overviewQuerySchema = z.object({
  projectId: z.string().uuid(),
  workflowId: z.string().uuid().optional(),
  window: z.enum(['1d', '7d', '30d']).optional().default('7d'),
});

const timeseriesQuerySchema = z.object({
  projectId: z.string().uuid(),
  workflowId: z.string().uuid().optional(),
  bucket: z.enum(['1m', '5m', '1h', '1d']).optional().default('5m'),
  window: z.enum(['1d', '7d', '30d']).optional().default('7d'),
});

const sliConfigUpdateSchema = z.object({
  targetSuccessPct: z.number().min(0).max(100).optional(),
  targetP95Ms: z.number().min(0).optional(),
  errorBudgetPct: z.number().min(0).max(100).optional(),
  window: z.enum(['1d', '7d', '30d']).optional(),
});

const sliConfigCreateSchema = z.object({
  projectId: z.string().uuid(),
  workflowId: z.string().uuid().optional(),
  targetSuccessPct: z.number().min(0).max(100).default(99),
  targetP95Ms: z.number().min(0).default(5000),
  errorBudgetPct: z.number().min(0).max(100).default(1),
  window: z.enum(['1d', '7d', '30d']).default('7d'),
});

// ===================================================================
// LEGACY ROUTES (Metrics Events)
// ===================================================================

/**
 * GET /api/analytics/overview
 * Get high-level analytics overview for a project or workflow
 */
router.get('/overview', requireAuth, async (req, res) => {
  try {
    const query = overviewQuerySchema.parse(req.query);

    // Compute current SLI
    const sliResult = await sli.computeSLI({
      projectId: query.projectId,
      workflowId: query.workflowId,
      window: query.window,
    });

    // Get runs per day for the window
    const windowMs = parseWindow(query.window);
    const windowStart = new Date(Date.now() - windowMs);

    const runsPerDayQuery = sql`
      SELECT
        DATE_TRUNC('day', ts) as day,
        COUNT(*) FILTER (WHERE type = 'run_started') as runs,
        COUNT(*) FILTER (WHERE type = 'run_succeeded') as success,
        COUNT(*) FILTER (WHERE type = 'run_failed') as failed
      FROM ${metricsEvents}
      WHERE ${metricsEvents.projectId} = ${query.projectId}
        ${query.workflowId ? sql`AND ${metricsEvents.workflowId} = ${query.workflowId}` : sql``}
        AND ${metricsEvents.ts} >= ${windowStart}
      GROUP BY day
      ORDER BY day ASC
    `;

    const runsPerDay = await db.execute(runsPerDayQuery);

    // Get PDF/DOCX generation stats
    const docStatsQuery = sql`
      SELECT
        COUNT(*) FILTER (WHERE type = 'pdf_succeeded') as pdf_success,
        COUNT(*) FILTER (WHERE type = 'pdf_failed') as pdf_failed,
        COUNT(*) FILTER (WHERE type = 'docx_succeeded') as docx_success,
        COUNT(*) FILTER (WHERE type = 'docx_failed') as docx_failed
      FROM ${metricsEvents}
      WHERE ${metricsEvents.projectId} = ${query.projectId}
        ${query.workflowId ? sql`AND ${metricsEvents.workflowId} = ${query.workflowId}` : sql``}
        AND ${metricsEvents.ts} >= ${windowStart}
    `;

    const docStatsResult = await db.execute(docStatsQuery);
    const docStats = docStatsResult.rows[0] as any;

    const pdfTotal = (parseInt(docStats.pdf_success) || 0) + (parseInt(docStats.pdf_failed) || 0);
    const docxTotal = (parseInt(docStats.docx_success) || 0) + (parseInt(docStats.docx_failed) || 0);

    res.json({
      sli: {
        successPct: sliResult.successPct,
        p95Ms: sliResult.p95Ms,
        errorBudgetBurnPct: sliResult.errorBudgetBurnPct,
        totalRuns: sliResult.totalRuns,
        violatesTarget: sliResult.violatesTarget,
      },
      runsPerDay: runsPerDay.rows.map((row: any) => ({
        date: row.day,
        runs: parseInt(row.runs) || 0,
        success: parseInt(row.success) || 0,
        failed: parseInt(row.failed) || 0,
      })),
      documents: {
        pdf: {
          success: parseInt(docStats.pdf_success) || 0,
          failed: parseInt(docStats.pdf_failed) || 0,
          successRate: pdfTotal > 0 ? ((parseInt(docStats.pdf_success) || 0) / pdfTotal) * 100 : 0,
        },
        docx: {
          success: parseInt(docStats.docx_success) || 0,
          failed: parseInt(docStats.docx_failed) || 0,
          successRate: docxTotal > 0 ? ((parseInt(docStats.docx_success) || 0) / docxTotal) * 100 : 0,
        },
      },
      window: {
        start: windowStart,
        end: new Date(),
        duration: query.window,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get analytics overview');
    res.status(500).json({ error: 'Failed to get analytics overview' });
  }
});

/**
 * GET /api/analytics/timeseries
 * Get timeseries data for charts
 */
router.get('/timeseries', requireAuth, async (req, res) => {
  try {
    const query = timeseriesQuerySchema.parse(req.query);

    const windowMs = parseWindow(query.window);
    const windowStart = new Date(Date.now() - windowMs);

    // Query rollups for the specified bucket size
    const conditions = [
      eq(metricsRollups.projectId, query.projectId),
      eq(metricsRollups.bucket, query.bucket),
      gte(metricsRollups.bucketStart, windowStart),
    ];

    if (query.workflowId) {
      conditions.push(eq(metricsRollups.workflowId, query.workflowId));
    }

    const rollups = await db
      .select()
      .from(metricsRollups)
      .where(and(...conditions))
      .orderBy(metricsRollups.bucketStart);

    const timeseries = rollups.map((rollup: any) => ({
      timestamp: rollup.bucketStart,
      runsCount: rollup.runsCount,
      runsSuccess: rollup.runsSuccess,
      runsError: rollup.runsError,
      durP50: rollup.durP50,
      durP95: rollup.durP95,
      pdfSuccess: rollup.pdfSuccess,
      pdfError: rollup.pdfError,
      docxSuccess: rollup.docxSuccess,
      docxError: rollup.docxError,
      successRate: rollup.runsCount > 0 ? (rollup.runsSuccess / rollup.runsCount) * 100 : 0,
    }));

    res.json({
      timeseries,
      bucket: query.bucket,
      window: query.window,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get timeseries data');
    res.status(500).json({ error: 'Failed to get timeseries data' });
  }
});

/**
 * GET /api/analytics/sli
 * Get SLI data and configuration
 */
router.get('/sli', requireAuth, async (req, res) => {
  try {
    const query = overviewQuerySchema.parse(req.query);

    // Compute current SLI
    const sliResult = await sli.computeSLI({
      projectId: query.projectId,
      workflowId: query.workflowId,
      window: query.window,
    });

    // Get SLI config
    const config = await sli.getConfig({
      projectId: query.projectId,
      workflowId: query.workflowId,
    });

    // Get recent SLI windows
    const recentWindows = await sli.getRecentWindows({
      projectId: query.projectId,
      workflowId: query.workflowId,
      limit: 30,
    });

    res.json({
      current: sliResult,
      config: config || {
        targetSuccessPct: 99,
        targetP95Ms: 5000,
        errorBudgetPct: 1,
        window: '7d',
      },
      history: recentWindows,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get SLI data');
    res.status(500).json({ error: 'Failed to get SLI data' });
  }
});

/**
 * POST /api/analytics/sli-config
 * Create or update SLI configuration
 */
router.post('/sli-config', requireAuth, async (req, res) => {
  try {
    const body = sliConfigCreateSchema.parse(req.body);

    // Check if config exists
    const existing = await sli.getConfig({
      projectId: body.projectId,
      workflowId: body.workflowId,
    });

    if (existing) {
      // Update existing config
      const updated = await sli.updateConfig({
        id: existing.id,
        targetSuccessPct: body.targetSuccessPct,
        targetP95Ms: body.targetP95Ms,
        errorBudgetPct: body.errorBudgetPct,
        window: body.window,
      });

      res.json(updated);
    } else {
      // Create new config
      const config = await sli.getOrCreateConfig({
        projectId: body.projectId,
        workflowId: body.workflowId,
        window: body.window,
      });

      // Update with provided values
      const updated = await sli.updateConfig({
        id: config.id,
        targetSuccessPct: body.targetSuccessPct,
        targetP95Ms: body.targetP95Ms,
        errorBudgetPct: body.errorBudgetPct,
        window: body.window,
      });

      res.status(201).json(updated);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to create/update SLI config');
    res.status(500).json({ error: 'Failed to create/update SLI config' });
  }
});

/**
 * PUT /api/analytics/sli-config/:id
 * Update SLI configuration
 */
router.put('/sli-config/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const body = sliConfigUpdateSchema.parse(req.body);

    const updated = await sli.updateConfig({
      id,
      ...body,
    });

    res.json(updated);
  } catch (error) {
    logger.error({ error }, 'Failed to update SLI config');
    res.status(500).json({ error: 'Failed to update SLI config' });
  }
});

// ===================================================================
// NEW ANALYTICS ROUTES (Workflow Run Events)
// ===================================================================

/**
 * POST /api/workflow-analytics/events
 * Record a new analytics event
 */
router.post('/events', async (req, res) => {
  try {
    // We'll trust the body for now, but validation is critical
    await analyticsService.recordEvent(req.body);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to record event');
    res.status(500).json({ error: 'Failed to record event' });
  }
});

/**
 * GET /api/workflow-analytics/:workflowId/dropoff
 */
router.get('/:workflowId/dropoff', requireAuth, async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { versionId } = req.query;
    if (!versionId || typeof versionId !== 'string') {
      return res.status(400).json({ error: "versionId required" });
    }

    const funnel = await dropoffService.getDropoffFunnel(workflowId, versionId);
    res.json({ success: true, data: funnel });
  } catch (error) {
    logger.error({ error, ...req.params }, "Failed to get dropoff");
    res.status(500).json({ error: "Internal Error" });
  }
});

/**
 * GET /api/workflow-analytics/:workflowId/heatmap
 */
router.get('/:workflowId/heatmap', requireAuth, async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { versionId } = req.query;
    if (!versionId || typeof versionId !== 'string') {
      return res.status(400).json({ error: "versionId required" });
    }

    const data = await heatmapService.getBlockHeatmap(workflowId, versionId);
    res.json({ success: true, data });
  } catch (error) {
    logger.error({ error, ...req.params }, "Failed to get heatmap");
    res.status(500).json({ error: "Internal Error" });
  }
});

/**
 * GET /api/workflow-analytics/:workflowId/branching
 */
router.get('/:workflowId/branching', requireAuth, async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { versionId } = req.query;
    if (!versionId || typeof versionId !== 'string') {
      return res.status(400).json({ error: "versionId required" });
    }

    const graph = await branchingService.getBranchingGraph(workflowId, versionId);
    res.json({ success: true, data: graph });
  } catch (error) {
    logger.error({ error, ...req.params }, "Failed to get branching");
    res.status(500).json({ error: "Internal Error" });
  }
});

/**
 * GET /api/workflow-analytics/run/:runId/timeline
 */
router.get('/run/:runId/timeline', requireAuth, async (req, res) => {
  try {
    const { runId } = req.params;
    const timeline = await analyticsService.getRunTimeline(runId);
    res.json({ success: true, data: timeline });
  } catch (error) {
    logger.error({ error, runId: req.params.runId }, "Failed to get timeline");
    res.status(500).json({ error: "Internal Error" });
  }
});

// ===================================================================
// HELPERS
// ===================================================================

function parseWindow(window: '1d' | '7d' | '30d'): number {
  switch (window) {
    case '1d':
      return 24 * 60 * 60 * 1000;
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return 30 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Register workflow analytics routes
 */
export function registerWorkflowAnalyticsRoutes(app: Express): void {
  app.use('/api/workflow-analytics', router);
}
