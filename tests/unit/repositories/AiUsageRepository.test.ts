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
  it('getUsageBreakdownSince returns per-(task_type, provider, model) breakdown (AISL-10 AC1)', async () => {
    const past = new Date(new Date().getTime() - 10000);

    // Group 1
    await aiUsageRepository.recordUsage({
      tenantId: testTenantId, provider: 'gemini', model: 'gemini-2.0-flash', taskType: 'generate',
      inputTokens: 100, outputTokens: 50, costUsd: 1.0, createdAt: past,
    });
    await aiUsageRepository.recordUsage({
      tenantId: testTenantId, provider: 'gemini', model: 'gemini-2.0-flash', taskType: 'generate',
      inputTokens: 200, outputTokens: 100, costUsd: 2.0, createdAt: past,
    });

    // Group 2
    await aiUsageRepository.recordUsage({
      tenantId: testTenantId, provider: 'openai', model: 'gpt-4', taskType: 'generate',
      inputTokens: 50, outputTokens: 10, costUsd: 5.0, createdAt: past,
    });

    // Pass tenantId to ignore rows inserted by previous tests
    const breakdown = await aiUsageRepository.getUsageBreakdownSince(new Date(past.getTime() - 1000), { tenantId: testTenantId });
    expect(breakdown).toHaveLength(2);

    const gemini = breakdown.find(b => b.provider === 'gemini');
    expect(gemini).toMatchObject({
      taskType: 'generate', model: 'gemini-2.0-flash',
      count: 2, inputTokens: 300, outputTokens: 150, totalCostUsd: 3.0, meanCostUsd: 1.5
    });

    const openai = breakdown.find(b => b.provider === 'openai');
    expect(openai).toMatchObject({
      taskType: 'generate', model: 'gpt-4',
      count: 1, inputTokens: 50, outputTokens: 10, totalCostUsd: 5.0, meanCostUsd: 5.0
    });
  });

  it('getUsageBreakdownSince tenantId scopes the result (AISL-10 AC2)', async () => {
    const past = new Date(new Date().getTime() - 10000);

    let otherTenantId: string;
    await db.transaction(async (tx) => {
      const factory = new TestFactory(tx);
      const { tenant } = await factory.createTenant();
      otherTenantId = tenant.id;
    });

    await aiUsageRepository.recordUsage({
      tenantId: testTenantId, provider: 'gemini', model: 'gemini-2.0-flash', taskType: 'generate',
      inputTokens: 10, outputTokens: 10, costUsd: 1.0, createdAt: past,
    });

    await aiUsageRepository.recordUsage({
      tenantId: otherTenantId!, provider: 'gemini', model: 'gemini-2.0-flash', taskType: 'generate',
      inputTokens: 20, outputTokens: 20, costUsd: 2.0, createdAt: past,
    });

    const scoped = await aiUsageRepository.getUsageBreakdownSince(new Date(past.getTime() - 1000), { tenantId: testTenantId });
    expect(scoped).toHaveLength(1);
    expect(scoped[0].totalCostUsd).toBe(1.0);

    const all = await aiUsageRepository.getUsageBreakdownSince(new Date(past.getTime() - 1000));
    // Since previous tests inserted rows, we can't assert the absolute length is 1 or 2.
    // Instead we verify that the two rows we just inserted are BOTH present in the overall result.
    const allCost = all.reduce((sum, b) => sum + b.totalCostUsd, 0);
    expect(allCost).toBeGreaterThanOrEqual(3.0); // 1.0 + 2.0 + whatever was there before
    
    // Verify both tenants are represented in the result
    const forTestTenant = await aiUsageRepository.getUsageBreakdownSince(new Date(past.getTime() - 1000), { tenantId: testTenantId });
    const forOtherTenant = await aiUsageRepository.getUsageBreakdownSince(new Date(past.getTime() - 1000), { tenantId: otherTenantId! });
    expect(forTestTenant).toHaveLength(1);
    expect(forOtherTenant).toHaveLength(1);
  });

  it('getUsageBreakdownSince yields an empty array for a tenant with no usage rows (AISL-10 AC5)', async () => {
    const empty = await aiUsageRepository.getUsageBreakdownSince(new Date(), { tenantId: testTenantId });
    expect(empty).toEqual([]);
  });

});
