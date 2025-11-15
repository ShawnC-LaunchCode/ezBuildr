/**
 * SLI (Service Level Indicator) Service
 *
 * Computes and tracks SLI metrics for workflows and projects:
 * - Success percentage (availability)
 * - P95 latency (performance)
 * - Error budget burn rate
 */

import { db } from '../db';
import {
  sliConfigs,
  sliWindows,
  metricsRollups,
  metricsEvents,
  type InsertSliConfig,
  type InsertSliWindow,
  type SliConfig,
} from '../../shared/schema';
import { eq, and, gte, lte, isNull, or, sql, desc } from 'drizzle-orm';
import logger from '../logger';

export interface SliResult {
  successPct: number;
  p95Ms: number;
  errorBudgetBurnPct: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  windowStart: Date;
  windowEnd: Date;
  target: {
    successPct: number;
    p95Ms: number;
    errorBudgetPct: number;
  };
  violatesTarget: boolean;
}

/**
 * Compute SLI for a project or workflow within a time window
 */
export async function computeSLI(params: {
  projectId: string;
  workflowId?: string;
  window?: '1d' | '7d' | '30d';
}): Promise<SliResult> {
  const window = params.window || '7d';
  const windowMs = parseWindow(window);
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  // Get or create SLI config
  const config = await getOrCreateConfig({
    projectId: params.projectId,
    workflowId: params.workflowId,
    window,
  });

  // Get rollup data for the window
  const rollups = await getRollupsForWindow({
    projectId: params.projectId,
    workflowId: params.workflowId,
    start: windowStart,
    end: now,
  });

  // Compute metrics from rollups
  let totalRuns = 0;
  let successfulRuns = 0;
  let failedRuns = 0;
  const durations: number[] = [];

  for (const rollup of rollups) {
    totalRuns += rollup.runsCount;
    successfulRuns += rollup.runsSuccess;
    failedRuns += rollup.runsError;

    // Collect p95 values for weighted percentile calculation
    if (rollup.durP95) {
      durations.push(rollup.durP95);
    }
  }

  // Calculate success percentage
  const successPct = totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 100;

  // Calculate p95 (simple average of rollup p95s - good enough for now)
  const p95Ms = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  // Calculate error budget burn
  const actualErrorPct = 100 - successPct;
  const errorBudgetBurnPct = config.errorBudgetPct > 0 ? (actualErrorPct / config.errorBudgetPct) * 100 : 0;

  // Check if targets are violated
  const violatesTarget = successPct < config.targetSuccessPct || p95Ms > config.targetP95Ms;

  return {
    successPct: Math.round(successPct * 100) / 100,
    p95Ms,
    errorBudgetBurnPct: Math.round(errorBudgetBurnPct * 100) / 100,
    totalRuns,
    successfulRuns,
    failedRuns,
    windowStart,
    windowEnd: now,
    target: {
      successPct: config.targetSuccessPct,
      p95Ms: config.targetP95Ms,
      errorBudgetPct: config.errorBudgetPct,
    },
    violatesTarget,
  };
}

/**
 * Save computed SLI to sli_windows table
 */
export async function saveSLIWindow(params: {
  tenantId: string;
  projectId: string;
  workflowId?: string;
  sli: SliResult;
}): Promise<void> {
  const insertData: InsertSliWindow = {
    tenantId: params.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId || null,
    windowStart: params.sli.windowStart,
    windowEnd: params.sli.windowEnd,
    successPct: Math.round(params.sli.successPct),
    p95Ms: params.sli.p95Ms,
    errorBudgetBurnPct: Math.round(params.sli.errorBudgetBurnPct),
  };

  await db.insert(sliWindows).values(insertData);

  logger.debug({
    projectId: params.projectId,
    workflowId: params.workflowId,
    successPct: params.sli.successPct,
  }, 'SLI window saved');
}

/**
 * Get or create SLI configuration
 * Returns existing config or creates default
 */
export async function getOrCreateConfig(params: {
  projectId: string;
  workflowId?: string;
  window?: '1d' | '7d' | '30d';
}): Promise<SliConfig> {
  const conditions = [eq(sliConfigs.projectId, params.projectId)];

  if (params.workflowId) {
    conditions.push(eq(sliConfigs.workflowId, params.workflowId));
  } else {
    conditions.push(isNull(sliConfigs.workflowId));
  }

  const existing = await db
    .select()
    .from(sliConfigs)
    .where(and(...conditions))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Create default config
  // Need tenantId - get from project
  const project = await db.query.projects.findFirst({
    where: (projects: any, { eq }: any) => eq(projects.id, params.projectId),
  });

  if (!project) {
    throw new Error(`Project not found: ${params.projectId}`);
  }

  const defaultConfig: InsertSliConfig = {
    tenantId: project.tenantId,
    projectId: params.projectId,
    workflowId: params.workflowId || null,
    targetSuccessPct: 99,
    targetP95Ms: 5000,
    errorBudgetPct: 1,
    window: params.window || '7d',
  };

  const [created] = await db.insert(sliConfigs).values(defaultConfig).returning();

  logger.info({
    projectId: params.projectId,
    workflowId: params.workflowId,
  }, 'SLI config created with defaults');

  return created;
}

/**
 * Update SLI configuration
 */
export async function updateConfig(params: {
  id: string;
  targetSuccessPct?: number;
  targetP95Ms?: number;
  errorBudgetPct?: number;
  window?: '1d' | '7d' | '30d';
}): Promise<SliConfig> {
  const updateData: Partial<InsertSliConfig> = {};

  if (params.targetSuccessPct !== undefined) {
    updateData.targetSuccessPct = params.targetSuccessPct;
  }
  if (params.targetP95Ms !== undefined) {
    updateData.targetP95Ms = params.targetP95Ms;
  }
  if (params.errorBudgetPct !== undefined) {
    updateData.errorBudgetPct = params.errorBudgetPct;
  }
  if (params.window !== undefined) {
    updateData.window = params.window;
  }

  const [updated] = await db
    .update(sliConfigs)
    .set(updateData)
    .where(eq(sliConfigs.id, params.id))
    .returning();

  if (!updated) {
    throw new Error(`SLI config not found: ${params.id}`);
  }

  logger.info({ id: params.id, updates: updateData }, 'SLI config updated');

  return updated;
}

/**
 * Get SLI configuration for a project or workflow
 */
export async function getConfig(params: {
  projectId: string;
  workflowId?: string;
}): Promise<SliConfig | null> {
  const conditions = [eq(sliConfigs.projectId, params.projectId)];

  if (params.workflowId) {
    conditions.push(eq(sliConfigs.workflowId, params.workflowId));
  } else {
    conditions.push(isNull(sliConfigs.workflowId));
  }

  const result = await db
    .select()
    .from(sliConfigs)
    .where(and(...conditions))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Get rollup data for a time window
 */
async function getRollupsForWindow(params: {
  projectId: string;
  workflowId?: string;
  start: Date;
  end: Date;
}): Promise<typeof metricsRollups.$inferSelect[]> {
  const conditions = [
    eq(metricsRollups.projectId, params.projectId),
    gte(metricsRollups.bucketStart, params.start),
    lte(metricsRollups.bucketStart, params.end),
  ];

  if (params.workflowId) {
    conditions.push(eq(metricsRollups.workflowId, params.workflowId));
  }

  return await db
    .select()
    .from(metricsRollups)
    .where(and(...conditions))
    .orderBy(metricsRollups.bucketStart);
}

/**
 * Get recent SLI windows
 */
export async function getRecentWindows(params: {
  projectId: string;
  workflowId?: string;
  limit?: number;
}): Promise<typeof sliWindows.$inferSelect[]> {
  const conditions = [eq(sliWindows.projectId, params.projectId)];

  if (params.workflowId) {
    conditions.push(eq(sliWindows.workflowId, params.workflowId));
  }

  return await db
    .select()
    .from(sliWindows)
    .where(and(...conditions))
    .orderBy(desc(sliWindows.windowEnd))
    .limit(params.limit || 10);
}

/**
 * Parse window string to milliseconds
 */
function parseWindow(window: '1d' | '7d' | '30d'): number {
  switch (window) {
    case '1d':
      return 24 * 60 * 60 * 1000;
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000; // Default to 7d
  }
}

/**
 * Export all SLI service functions
 */
export default {
  computeSLI,
  saveSLIWindow,
  getOrCreateConfig,
  updateConfig,
  getConfig,
  getRecentWindows,
};
