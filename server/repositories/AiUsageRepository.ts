import { and, eq, gte, sql } from "drizzle-orm";

import { aiUsage, type AiUsage, type InsertAiUsage } from "@shared/schema";

import { BaseRepository, type DbTransaction } from "./BaseRepository";

/**
 * Repository for the per-tenant AI usage ledger (ICW2-B7).
 *
 * `AIProviderClient.callLLM` is the single writer (one row per call, once a
 * `tenantId` is present on the config) and the single reader of the rolling
 * budget total that gates further calls.
 */
export class AiUsageRepository extends BaseRepository<typeof aiUsage, AiUsage, InsertAiUsage> {
  constructor() {
    super(aiUsage);
  }

  /**
   * Record one AI call's token usage and cost for a tenant.
   */
  async recordUsage(entry: InsertAiUsage, tx?: DbTransaction): Promise<AiUsage> {
    return this.create(entry, tx);
  }

  /**
   * Sum of input+output tokens recorded for a tenant since `since` (inclusive).
   * Used to compare against `LIMITS.AI_TENANT_MONTHLY_TOKEN_BUDGET` for a
   * rolling window. Returns 0 when the tenant has no usage rows yet.
   */
  async getTokenUsageSince(tenantId: string, since: Date, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const [row] = await database
      .select({
        total: sql<string>`COALESCE(SUM(${aiUsage.inputTokens} + ${aiUsage.outputTokens}), 0)`,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.tenantId, tenantId), gte(aiUsage.createdAt, since)));
    return Number(row?.total ?? 0);
  }

  /**
   * Sum of cost_usd recorded for a tenant since `since` (inclusive).
   * Used to compare against dollar-based budgets for a rolling window.
   * Returns 0 when the tenant has no usage rows yet.
   */
  async getCostUsdSince(tenantId: string, since: Date, tx?: DbTransaction): Promise<number> {
    const database = this.getDb(tx);
    const [row] = await database
      .select({
        total: sql<string>`COALESCE(SUM(${aiUsage.costUsd}), 0)`,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.tenantId, tenantId), gte(aiUsage.createdAt, since)));
    return Number(row?.total ?? 0);
  }
  /**
   * Returns a breakdown of AI usage grouped by task type, provider, and model.
   * Includes count, summed input/output tokens, summed cost_usd, and mean cost_usd.
   */
  async getUsageBreakdownSince(
    since: Date,
    opts?: { tenantId?: string; tx?: DbTransaction }
  ): Promise<Array<{
    taskType: string | null;
    provider: string;
    model: string;
    count: number;
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    meanCostUsd: number;
  }>> {
    const database = this.getDb(opts?.tx);
    const conditions = [gte(aiUsage.createdAt, since)];
    if (opts?.tenantId) {
      conditions.push(eq(aiUsage.tenantId, opts.tenantId));
    }

    const rows = await database
      .select({
        taskType: aiUsage.taskType,
        provider: aiUsage.provider,
        model: aiUsage.model,
        count: sql<string>`COUNT(*)`,
        inputTokens: sql<string>`COALESCE(SUM(${aiUsage.inputTokens}), 0)`,
        outputTokens: sql<string>`COALESCE(SUM(${aiUsage.outputTokens}), 0)`,
        totalCostUsd: sql<string>`COALESCE(SUM(${aiUsage.costUsd}), 0)`,
        meanCostUsd: sql<string>`COALESCE(AVG(${aiUsage.costUsd}), 0)`,
      })
      .from(aiUsage)
      .where(and(...conditions))
      .groupBy(aiUsage.taskType, aiUsage.provider, aiUsage.model);

    return rows.map((row) => ({
      taskType: row.taskType,
      provider: row.provider,
      model: row.model,
      count: Number(row.count),
      inputTokens: Number(row.inputTokens),
      outputTokens: Number(row.outputTokens),
      totalCostUsd: Number(row.totalCostUsd),
      meanCostUsd: Number(row.meanCostUsd),
    }));
  }
}

export const aiUsageRepository = new AiUsageRepository();
