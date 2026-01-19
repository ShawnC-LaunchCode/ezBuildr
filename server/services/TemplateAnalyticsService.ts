/**
 * Template Analytics Service
 *
 * Track and analyze document generation metrics:
 * - Success/failure rates
 * - Performance metrics
 * - Common errors
 * - Usage statistics
 * - Popular mappings
 *
 * Features:
 * - Real-time metrics tracking
 * - Aggregated statistics
 * - Trend analysis
 * - Error pattern detection
 * - Performance insights
 *
 * Usage:
 * ```typescript
 * // Track generation
 * await templateAnalytics.trackGeneration(templateId, 'success', 1234);
 *
 * // Get insights
 * const insights = await templateAnalytics.getTemplateInsights(templateId);
 * console.log('Success rate:', insights.successRate);
 * console.log('Avg duration:', insights.avgDuration);
 * ```
 */
import { eq, and, desc, gte, sql, count } from 'drizzle-orm';
import { templateGenerationMetrics, templates } from '../../shared/schema';
import { db } from '../db';
import { logger } from '../logger';
// ============================================================================
// TYPES
// ============================================================================
export interface GenerationMetric {
  id: string;
  templateId: string;
  runId: string | null;
  result: 'success' | 'failure' | 'skipped';
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
}
export interface TemplateInsights {
  templateId: string;
  templateName: string;
  totalGenerations: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  successRate: number; // 0-100
  avgDuration: number | null; // milliseconds
  medianDuration: number | null;
  p95Duration: number | null; // 95th percentile
  commonErrors: Array<{
    error: string;
    count: number;
    percentage: number;
  }>;
  recentGenerations: GenerationMetric[];
  trends: {
    last7Days: TrendData;
    last30Days: TrendData;
  };
}
export interface TrendData {
  totalGenerations: number;
  successRate: number;
  avgDuration: number | null;
  changeFromPrevious: {
    generations: number; // % change
    successRate: number; // % change
    duration: number; // % change
  };
}
export interface SystemWideMetrics {
  totalTemplates: number;
  totalGenerations: number;
  overallSuccessRate: number;
  avgGenerationTime: number | null;
  topTemplates: Array<{
    templateId: string;
    templateName: string;
    generationCount: number;
    successRate: number;
  }>;
  recentErrors: Array<{
    templateId: string;
    templateName: string;
    error: string;
    occurredAt: Date;
  }>;
}
// ============================================================================
// SERVICE CLASS
// ============================================================================
export class TemplateAnalyticsService {
  /**
   * Track a document generation event
   */
  async trackGeneration(
    templateId: string,
    result: 'success' | 'failure' | 'skipped',
    durationMs?: number,
    errorMessage?: string,
    runId?: string
  ): Promise<void> {
    try {
      await db.insert(templateGenerationMetrics).values({
        templateId,
        runId: runId || null,
        result,
        durationMs: durationMs || null,
        errorMessage: errorMessage || null,
      });
      logger.debug(
        {
          templateId,
          result,
          durationMs,
        },
        'Generation metric tracked'
      );
    } catch (error: any) {
      logger.error({ error, templateId }, 'Failed to track generation metric');
      // Don't throw - metrics tracking shouldn't break generation
    }
  }
  /**
   * Get comprehensive insights for a template
   */
  async getTemplateInsights(templateId: string): Promise<TemplateInsights> {
    logger.info({ templateId }, 'Fetching template insights');
    // Get template info
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, templateId))
      .limit(1);
    if (!template) {
      throw new Error('Template not found');
    }
    // Get all metrics for this template
    const metrics = await db
      .select()
      .from(templateGenerationMetrics)
      .where(eq(templateGenerationMetrics.templateId, templateId))
      .orderBy(desc(templateGenerationMetrics.createdAt));
    // Calculate basic stats
    const totalGenerations = metrics.length;
    const successCount = metrics.filter((m) => m.result === 'success').length;
    const failureCount = metrics.filter((m) => m.result === 'failure').length;
    const skippedCount = metrics.filter((m) => m.result === 'skipped').length;
    const successRate = totalGenerations > 0 ? (successCount / totalGenerations) * 100 : 0;
    // Calculate duration stats (only for successful generations)
    const durations = metrics
      .filter((m) => m.result === 'success' && m.durationMs !== null)
      .map((m) => m.durationMs as number)
      .sort((a, b) => a - b);
    const avgDuration =
      durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : null;
    const medianDuration =
      durations.length > 0
        ? durations[Math.floor(durations.length / 2)]
        : null;
    const p95Duration =
      durations.length > 0
        ? durations[Math.floor(durations.length * 0.95)]
        : null;
    // Analyze common errors
    const errors = metrics
      .filter((m) => m.result === 'failure' && m.errorMessage)
      .map((m) => m.errorMessage as string);
    const errorCounts = errors.reduce((acc, error) => {
      acc[error] = (acc[error] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const commonErrors = Object.entries(errorCounts)
      .map(([error, count]) => ({
        error,
        count,
        percentage: (count / failureCount) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 errors
    // Get recent generations (last 10)
    const recentGenerations = metrics.slice(0, 10) as GenerationMetric[];
    // Calculate trends
    const now = new Date();
    const last7Days = await this.calculateTrend(templateId, 7);
    const last30Days = await this.calculateTrend(templateId, 30);
    return {
      templateId,
      templateName: template.name,
      totalGenerations,
      successCount,
      failureCount,
      skippedCount,
      successRate: Math.round(successRate * 100) / 100,
      avgDuration: avgDuration ? Math.round(avgDuration) : null,
      medianDuration,
      p95Duration,
      commonErrors,
      recentGenerations,
      trends: {
        last7Days,
        last30Days,
      },
    };
  }
  /**
   * Calculate trend data for a time period
   */
  private async calculateTrend(templateId: string, days: number): Promise<TrendData> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const previousStartDate = new Date();
    previousStartDate.setDate(previousStartDate.getDate() - days * 2);
    // Current period
    const currentMetrics = await db
      .select()
      .from(templateGenerationMetrics)
      .where(
        and(
          eq(templateGenerationMetrics.templateId, templateId),
          gte(templateGenerationMetrics.createdAt, startDate)
        )
      );
    // Previous period (for comparison)
    const previousMetrics = await db
      .select()
      .from(templateGenerationMetrics)
      .where(
        and(
          eq(templateGenerationMetrics.templateId, templateId),
          gte(templateGenerationMetrics.createdAt, previousStartDate),
          sql`${templateGenerationMetrics.createdAt} < ${startDate}`
        )
      );
    // Calculate current stats
    const currentTotal = currentMetrics.length;
    const currentSuccess = currentMetrics.filter((m) => m.result === 'success').length;
    const currentSuccessRate = currentTotal > 0 ? (currentSuccess / currentTotal) * 100 : 0;
    const currentDurations = currentMetrics
      .filter((m) => m.result === 'success' && m.durationMs)
      .map((m) => m.durationMs as number);
    const currentAvgDuration =
      currentDurations.length > 0
        ? currentDurations.reduce((sum, d) => sum + d, 0) / currentDurations.length
        : null;
    // Calculate previous stats
    const previousTotal = previousMetrics.length;
    const previousSuccess = previousMetrics.filter((m) => m.result === 'success').length;
    const previousSuccessRate = previousTotal > 0 ? (previousSuccess / previousTotal) * 100 : 0;
    const previousDurations = previousMetrics
      .filter((m) => m.result === 'success' && m.durationMs)
      .map((m) => m.durationMs as number);
    const previousAvgDuration =
      previousDurations.length > 0
        ? previousDurations.reduce((sum, d) => sum + d, 0) / previousDurations.length
        : null;
    // Calculate changes
    const generationsChange =
      previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;
    const successRateChange = currentSuccessRate - previousSuccessRate;
    const durationChange =
      previousAvgDuration && currentAvgDuration
        ? ((currentAvgDuration - previousAvgDuration) / previousAvgDuration) * 100
        : 0;
    return {
      totalGenerations: currentTotal,
      successRate: Math.round(currentSuccessRate * 100) / 100,
      avgDuration: currentAvgDuration ? Math.round(currentAvgDuration) : null,
      changeFromPrevious: {
        generations: Math.round(generationsChange * 100) / 100,
        successRate: Math.round(successRateChange * 100) / 100,
        duration: Math.round(durationChange * 100) / 100,
      },
    };
  }
  /**
   * Get system-wide metrics
   */
  async getSystemWideMetrics(): Promise<SystemWideMetrics> {
    logger.info('Fetching system-wide metrics');
    // Total templates
    const totalTemplates = await db
      .select({ count: count() })
      .from(templates)
      .then((result) => result[0]?.count || 0);
    // Total generations
    const totalGenerations = await db
      .select({ count: count() })
      .from(templateGenerationMetrics)
      .then((result) => result[0]?.count || 0);
    // Overall success rate
    const successCount = await db
      .select({ count: count() })
      .from(templateGenerationMetrics)
      .where(eq(templateGenerationMetrics.result, 'success'))
      .then((result) => result[0]?.count || 0);
    const overallSuccessRate =
      totalGenerations > 0 ? (successCount / totalGenerations) * 100 : 0;
    // Average generation time
    const avgGenerationTime = await db
      .select({
        avg: sql<number>`AVG(${templateGenerationMetrics.durationMs})`,
      })
      .from(templateGenerationMetrics)
      .where(
        and(
          eq(templateGenerationMetrics.result, 'success'),
          sql`${templateGenerationMetrics.durationMs} IS NOT NULL`
        )
      )
      .then((result) => result[0]?.avg || null);
    // Top templates by generation count
    const topTemplatesData = await db
      .select({
        templateId: templateGenerationMetrics.templateId,
        count: count(),
        successCount: sql<number>`SUM(CASE WHEN ${templateGenerationMetrics.result} = 'success' THEN 1 ELSE 0 END)`,
      })
      .from(templateGenerationMetrics)
      .groupBy(templateGenerationMetrics.templateId)
      .orderBy(desc(count()))
      .limit(5);
    // Get template names
    const topTemplates = await Promise.all(
      topTemplatesData.map(async (t) => {
        const [template] = await db
          .select()
          .from(templates)
          .where(eq(templates.id, t.templateId))
          .limit(1);
        return {
          templateId: t.templateId,
          templateName: template?.name || 'Unknown',
          generationCount: t.count,
          successRate: t.count > 0 ? (t.successCount / t.count) * 100 : 0,
        };
      })
    );
    // Recent errors (last 10)
    const recentErrorsData = await db
      .select()
      .from(templateGenerationMetrics)
      .where(eq(templateGenerationMetrics.result, 'failure'))
      .orderBy(desc(templateGenerationMetrics.createdAt))
      .limit(10);
    const recentErrors = await Promise.all(
      recentErrorsData.map(async (e) => {
        const [template] = await db
          .select()
          .from(templates)
          .where(eq(templates.id, e.templateId))
          .limit(1);
        return {
          templateId: e.templateId,
          templateName: template?.name || 'Unknown',
          error: e.errorMessage || 'Unknown error',
          occurredAt: e.createdAt!,
        };
      })
    );
    return {
      totalTemplates,
      totalGenerations,
      overallSuccessRate: Math.round(overallSuccessRate * 100) / 100,
      avgGenerationTime: avgGenerationTime ? Math.round(avgGenerationTime) : null,
      topTemplates,
      recentErrors,
    };
  }
  /**
   * Clean up old metrics (keep last N days)
   */
  async cleanupOldMetrics(retentionDays: number = 90): Promise<number> {
    logger.info({ retentionDays }, 'Cleaning up old metrics');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const deleted = await db
      .delete(templateGenerationMetrics)
      .where(sql`${templateGenerationMetrics.createdAt} < ${cutoffDate}`)
      .returning({ id: templateGenerationMetrics.id });
    logger.info({ deletedCount: deleted.length, retentionDays }, 'Old metrics cleaned up');
    return deleted.length;
  }
  /**
   * Get metrics for a specific time range
   */
  async getMetricsInRange(
    templateId: string,
    startDate: Date,
    endDate: Date
  ): Promise<GenerationMetric[]> {
    const metrics = await db
      .select()
      .from(templateGenerationMetrics)
      .where(
        and(
          eq(templateGenerationMetrics.templateId, templateId),
          gte(templateGenerationMetrics.createdAt, startDate),
          sql`${templateGenerationMetrics.createdAt} <= ${endDate}`
        )
      )
      .orderBy(desc(templateGenerationMetrics.createdAt));
    return metrics as GenerationMetric[];
  }
  /**
   * Export metrics to CSV
   */
  async exportMetricsToCsv(templateId: string): Promise<string> {
    const metrics = await db
      .select()
      .from(templateGenerationMetrics)
      .where(eq(templateGenerationMetrics.templateId, templateId))
      .orderBy(desc(templateGenerationMetrics.createdAt));
    // CSV header
    let csv = 'ID,Template ID,Run ID,Result,Duration (ms),Error,Created At\n';
    // CSV rows
    for (const metric of metrics) {
      csv += `${metric.id},${metric.templateId},${metric.runId || ''},${metric.result},${
        metric.durationMs || ''
      },"${(metric.errorMessage || '').replace(/"/g, '""')}",${metric.createdAt}\n`;
    }
    return csv;
  }
}
// Singleton instance
export const templateAnalytics = new TemplateAnalyticsService();