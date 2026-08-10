import { it, expect, beforeEach } from 'vitest';

import { db } from '../../../server/db';
import { aiUsageRepository } from '../../../server/repositories/AiUsageRepository';
import { describeWithDb } from '../../helpers/dbTestHelper';
import { TestFactory } from '../../helpers/testFactory';

describeWithDb('AiUsageRepository', () => {
  let testTenantId: string;

  beforeEach(async () => {
    await db.transaction(async (tx) => {
      const factory = new TestFactory(tx);
      const { tenant } = await factory.createTenant();
      testTenantId = tenant.id;
    });
  });

  it('getCostUsdSince returns the summed cost_usd for a tenant over a window (AISL-9 AC1)', async () => {
    const now = new Date();
    const past = new Date(now.getTime() - 10000);
    const older = new Date(now.getTime() - 20000);

    await aiUsageRepository.recordUsage({
      tenantId: testTenantId,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      taskType: 'workflow_generation',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 1.5,
      createdAt: past,
    });

    await aiUsageRepository.recordUsage({
      tenantId: testTenantId,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      taskType: 'workflow_generation',
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.5,
      createdAt: now,
    });

    // Older than the 'since' window
    await aiUsageRepository.recordUsage({
      tenantId: testTenantId,
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      taskType: 'workflow_generation',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 10.0,
      createdAt: older,
    });

    const cost = await aiUsageRepository.getCostUsdSince(testTenantId, past);
    expect(cost).toBe(2.0); // 1.5 + 0.5
  });

  it('getCostUsdSince returns 0 for a tenant with no rows (AISL-9 AC1)', async () => {
    const cost = await aiUsageRepository.getCostUsdSince(testTenantId, new Date());
    expect(cost).toBe(0);
  });
});
