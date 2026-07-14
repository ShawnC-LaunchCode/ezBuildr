/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/**
 * Workflow Analytics API Routes (Stage 11 + Stage 15)
 *
 * Endpoints for accessing metrics, rollups, SLI data, and new event-based analytics.
 */
import { eq, and, gte, sql } from 'drizzle-orm';
import { Router, type Express, type Request, type Response } from 'express';
import { z } from 'zod';

import {
  metricsEvents,
  metricsRollups,
  workflowRunMetrics,
} from '../../shared/schema';
import { db } from '../db';
import logger from '../logger';
import { hybridAuth } from '../middleware';
import { aclService } from '../services/AclService';
import { analyticsService, eventSchema } from '../services/analytics/AnalyticsService';
import { branchingService } from '../services/analytics/BranchingService';
import { dropoffService } from '../services/analytics/DropoffService';
import { heatmapService } from '../services/analytics/HeatmapService';
import sli from '../services/sli';
import { workflowService } from '../services/WorkflowService';
import { asyncHandler } from '../utils/asyncHandler';

import type { AuthRequest } from '../middleware/auth';
const router = Router();
const ACCESS_DENIED_ERROR = "Access denied";
const UNAUTHORIZED_ERROR = "Unauthorized";
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

interface RunsPerDayRow {
  day: Date;
  runs: string;
  success: string;
  failed: string;
}

interface DocStatsRow {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  pdf_success: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  pdf_failed: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  docx_success: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  docx_failed: string;
}

function getAuthenticatedUserId(req: Request, res: Response): string | undefined {
  const userId = (req as AuthRequest).userId;
  if (userId === undefined) {
    res.status(401).json({ error: UNAUTHORIZED_ERROR });
    return undefined;
  }
  return userId;
}

function isAnalyticsWindow(value: unknown): value is '1d' | '7d' | '30d' {
  return value === '1d' || value === '7d' || value === '30d';
}
// ===================================================================
// LEGACY ROUTES (Metrics Events)
// ===================================================================
/**
 * GET /api/analytics/overview
 * Get high-level analytics overview for a project or workflow
 */
router.get('/overview', hybridAuth, asyncHandler(async (req, res) => {
  try {
    const query = overviewQuerySchema.parse(req.query);
    
    const userId = getAuthenticatedUserId(req, res);
    if (userId === undefined) {
      return;
    }
    if (query.workflowId) {
      await workflowService.verifyAccess(query.workflowId, userId, 'view');
    } else {
      const hasAccess = await aclService.hasProjectRole(userId, query.projectId, 'view');
      if (!hasAccess) {
        return res.status(403).json({ error: ACCESS_DENIED_ERROR });
      }
    }

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
    const docStats = (docStatsResult.rows[0] as unknown) as DocStatsRow;
    const pdfTotal = safeParseInt(docStats.pdf_success) + safeParseInt(docStats.pdf_failed);
    const docxTotal = safeParseInt(docStats.docx_success) + safeParseInt(docStats.docx_failed);
    res.json({
      sli: {
        successPct: sliResult.successPct,
        p95Ms: sliResult.p95Ms,
        errorBudgetBurnPct: sliResult.errorBudgetBurnPct,
        totalRuns: sliResult.totalRuns,
        violatesTarget: sliResult.violatesTarget,
      },
      runsPerDay: runsPerDay.rows.map((row: unknown) => {
        const r = row as RunsPerDayRow;
        return {
          date: r.day,
          runs: safeParseInt(r.runs),
          success: safeParseInt(r.success),
          failed: safeParseInt(r.failed),
        };
      }),
      documents: {
        pdf: {
          success: safeParseInt(docStats.pdf_success),
          failed: safeParseInt(docStats.pdf_failed),
          successRate: pdfTotal > 0 ? (safeParseInt(docStats.pdf_success) / pdfTotal) * 100 : 0,
        },
        docx: {
          success: safeParseInt(docStats.docx_success),
          failed: safeParseInt(docStats.docx_failed),
          successRate: docxTotal > 0 ? (safeParseInt(docStats.docx_success) / docxTotal) * 100 : 0,
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
}));
/**
 * GET /api/analytics/timeseries
 * Get timeseries data for charts
 */
router.get('/timeseries', hybridAuth, asyncHandler(async (req, res) => {
  try {
    const query = timeseriesQuerySchema.parse(req.query);
    const userId = getAuthenticatedUserId(req, res);
    if (userId === undefined) {
      return;
    }
    if (query.workflowId) {
      await workflowService.verifyAccess(query.workflowId, userId, 'view');
    } else {
      const hasAccess = await aclService.hasProjectRole(userId, query.projectId, 'view');
      if (!hasAccess) {
        return res.status(403).json({ error: ACCESS_DENIED_ERROR });
      }
    }
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
    const timeseries = rollups.map((rollup) => ({
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
}));
/**
 * GET /api/analytics/sli
 * Get SLI data and configuration
 */
router.get('/sli', hybridAuth, asyncHandler(async (req, res) => {
  try {
    const query = overviewQuerySchema.parse(req.query);
    const userId = getAuthenticatedUserId(req, res);
    if (userId === undefined) {
      return;
    }
    if (query.workflowId) {
      await workflowService.verifyAccess(query.workflowId, userId, 'view');
    } else {
      const hasAccess = await aclService.hasProjectRole(userId, query.projectId, 'view');
      if (!hasAccess) {
        return res.status(403).json({ error: ACCESS_DENIED_ERROR });
      }
    }
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
      config: config ?? {
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
}));
/**
 * POST /api/analytics/sli-config
 * Create or update SLI configuration
 */
router.post('/sli-config', hybridAuth, asyncHandler(async (req, res) => {
  try {
    const body = sliConfigCreateSchema.parse(req.body);
    const userId = getAuthenticatedUserId(req, res);
    if (userId === undefined) {
      return;
    }
    if (body.workflowId) {
      await workflowService.verifyAccess(body.workflowId, userId, 'edit');
    } else {
      const hasAccess = await aclService.hasProjectRole(userId, body.projectId, 'edit');
      if (!hasAccess) {
        return res.status(403).json({ error: ACCESS_DENIED_ERROR });
      }
    }
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
}));
/**
 * PUT /api/analytics/sli-config/:id
 * Update SLI configuration
 */
router.put('/sli-config/:id', hybridAuth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getAuthenticatedUserId(req, res);
    if (userId === undefined) {
      return;
    }

    const existingConfig = await db.query.sliConfigs.findFirst({
      where: (cfg, { eq }) => eq(cfg.id, id)
    });
    
    if (existingConfig) {
      if (existingConfig.workflowId) {
        await workflowService.verifyAccess(existingConfig.workflowId, userId, 'edit');
      } else if (existingConfig.projectId) {
        const hasAccess = await aclService.hasProjectRole(userId, existingConfig.projectId, 'edit');
        if (!hasAccess) {
          return res.status(403).json({ error: ACCESS_DENIED_ERROR });
        }
      }
    }

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
}));
// ===================================================================
// NEW ANALYTICS ROUTES (Workflow Run Events)
// ===================================================================
/**
 * POST /api/workflow-analytics/events
 * Record a new analytics event
 */
router.post('/events', hybridAuth, asyncHandler(async (req, res) => {
  try {
    const body = eventSchema.parse(req.body);
    const userId = getAuthenticatedUserId(req, res);
    if (userId === undefined) {
      return;
    }
    if (body.workflowId) {
      try {
        await workflowService.verifyAccess(body.workflowId, userId, 'view');
      } catch (err) {
        return res.status(403).json({ error: "Access denied to workflow" });
      }
    }
    await analyticsService.recordEvent(body);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to record event');
    res.status(500).json({ error: 'Failed to record event' });
  }
}));
/**
 * GET /api/workflow-analytics/:workflowId/dropoff
 */
router.get('/:workflowId/dropoff', hybridAuth, asyncHandler(async (req, res) => {
  try {
    const { workflowId } = req.params;
    const userId = getAuthenticatedUserId(req, res);
    if (userId === undefined) {
      return;
    }
    await workflowService.verifyAccess(workflowId, userId, 'view');
    const { versionId } = req.query;
    if (versionId === undefined || typeof versionId !== 'string') {
      return res.status(400).json({ error: "versionId required" });
    }
    const funnel = await dropoffService.getDropoffFunnel(workflowId, versionId);
    res.json({ success: true, data: funnel });
  } catch (error) {
    logger.error({ error, ...req.params }, "Failed to get dropoff");
    res.status(500).json({ error: "Internal Error" });
  }
}));
/**
 * GET /api/workflow-analytics/:workflowId/heatmap
 */
router.get('/:workflowId/heatmap', hybridAuth, asyncHandler(async (req, res) => {
  try {
    const { workflowId } = req.params;
    const userId = getAuthenticatedUserId(req, res);
    if (userId === undefined) {
      return;
    }
    await workflowService.verifyAccess(workflowId, userId, 'view');
    const { versionId } = req.query;
    if (versionId === undefined || typeof versionId !== 'string') {
      return res.status(400).json({ error: "versionId required" });
    }
    const data = await heatmapService.getBlockHeatmap(workflowId, versionId);
    res.json({ success: true, data });
  } catch (error) {
    logger.error({ error, ...req.params }, "Failed to get heatmap");
    res.status(500).json({ error: "Internal Error" });
  }
}));
/**
 * GET /api/workflow-analytics/:workflowId/branching
 */
router.get('/:workflowId/branching', hybridAuth, asyncHandler(async (req, res) => {
  try {
    const { workflowId } = req.params;
    const userId = getAuthenticatedUserId(req, res);
    if (userId === undefined) {
      return;
    }
    await workflowService.verifyAccess(workflowId, userId, 'view');
    const { versionId } = req.query;
    if (versionId === undefined || typeof versionId !== 'string') {
      return res.status(400).json({ error: "versionId required" });
    }
    const graph = await branchingService.getBranchingGraph(workflowId, versionId);
    res.json({ success: true, data: graph });
  } catch (error) {
    logger.error({ error, ...req.params }, "Failed to get branching");
    res.status(500).json({ error: "Internal Error" });
  }
}));
/**
 * GET /api/workflow-analytics/:workflowId/health
 * Get real-time health metrics from updated workflow_run_metrics table
 */
router.get('/:workflowId/health', hybridAuth, asyncHandler(async (req, res) => {
  try {
    const { workflowId } = req.params;
    const userId = getAuthenticatedUserId(req, res);
    if (userId === undefined) {
      return;
    }
    await workflowService.verifyAccess(workflowId, userId, 'view');
    const { versionId } = req.query;
    const versionIdFilter = typeof versionId === 'string' ? versionId : undefined;

    // Default window: 30 days
    const window = isAnalyticsWindow(req.query.window) ? req.query.window : '30d';
    const windowMs = parseWindow(window);
    const windowStart = new Date(Date.now() - windowMs);

    const metricsConditions = [
      eq(workflowRunMetrics.workflowId, workflowId),
      gte(workflowRunMetrics.createdAt, windowStart)
    ];

    if (versionIdFilter !== undefined) {
      metricsConditions.push(eq(workflowRunMetrics.versionId, versionIdFilter));
    }

    const metricsStats = await db
      .select({
        completed: sql<number>`count(*)`,
        avgTime: sql<number>`avg(${workflowRunMetrics.totalTimeMs})`,
        errorCount: sql<number>`sum(${workflowRunMetrics.validationErrors})`
      })
      .from(workflowRunMetrics)
      .where(and(...metricsConditions));

    // Get total runs (started) via workflowRuns table for accuracy
    const runsConfig = await db.execute(sql`
        SELECT count(*) as total
        FROM workflow_runs
        WHERE workflow_id = ${workflowId}
        AND created_at >= ${windowStart}
        ${versionIdFilter !== undefined ? sql`AND workflow_version_id = ${versionIdFilter}` : sql``}
      `);

    // Get runs with errors
    const runsWithErrorsResult = await db.execute(sql`
        SELECT count(*) as count
        FROM ${workflowRunMetrics}
        WHERE workflow_id = ${workflowId}
        AND created_at >= ${windowStart}
        AND (validation_errors > 0 OR script_errors > 0)
        ${versionIdFilter !== undefined ? sql`AND version_id = ${versionIdFilter}` : sql``}
      `);

    const totalRuns = safeParseInt(runsConfig.rows[0].total as string);
    const completedRuns = safeParseInt(metricsStats[0].completed as unknown as string);
    const avgTime = safeFloat(metricsStats[0].avgTime as unknown as string);
    const runsWithErrors = safeParseInt(runsWithErrorsResult.rows[0].count as string);

    res.json({
      success: true,
      data: {
        totalRuns,
        completedRuns,
        completionRate: totalRuns > 0 ? (completedRuns / totalRuns) * 100 : 0,
        avgTimeMs: avgTime,
        errorRate: totalRuns > 0 ? (runsWithErrors / totalRuns) * 100 : 0
      }
    });
  } catch (error) {
    logger.error({ error, ...req.params }, "Failed to get health metrics");
    res.status(500).json({ error: "Internal Error" });
  }
}));

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


function safeParseInt(val: string | number | undefined | null): number {
  if (val === undefined || val === null) {return 0;}
  const parsed = typeof val === 'number' ? val : parseInt(val, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function safeFloat(val: string | number | undefined | null): number {
  if (val === undefined || val === null) {return 0;}
  const parsed = typeof val === 'number' ? val : parseFloat(val);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Register workflow analytics routes
 */
export function registerWorkflowAnalyticsRoutes(app: Express): void {
  app.use('/api/workflow-analytics', router);
}
