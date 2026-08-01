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
}

export const aiUsageRepository = new AiUsageRepository();
