import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { LIMITS } from '@shared/limits';

import { aiUsageRepository, stepRepository } from '../../../../server/repositories';
import { AIError } from '../../../../server/services/ai/AIError';
import { AIProviderClient } from '../../../../server/services/ai/AIProviderClient';
import { estimateTokenCount } from '../../../../server/services/ai/AIServiceUtils';
import { ProviderFactory } from '../../../../server/services/ai/providers/ProviderFactory';
import { RunLifecycleService } from '../../../../server/services/workflow-runs/RunLifecycleService';

import type { AiUsageRepository } from '../../../../server/repositories/AiUsageRepository';
import type { IAIProvider } from '../../../../server/services/ai/providers/types';
import type { AiUsage, Step } from '../../../../shared/schema';

// RLS-5: usage rows and the budget read now run inside `withTenant`
// (`ai_usage` is covered), so the client opens a transaction and pins the GUC
// on it. This suite spies on the repository, so the db itself needs a stub.
vi.mock('../../../../server/db', () => ({
  db: {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ execute: vi.fn() })),
  },
}));

const loggerMock = vi.hoisted(() => {
  const mock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  mock.child.mockReturnValue(mock);
  return mock;
});

vi.mock('../../../../server/logger', () => ({
  createLogger: vi.fn(() => loggerMock),
  logger: loggerMock,
  default: loggerMock,
}));

describe('AIProviderClient tenant context diagnostics (AISL-2)', () => {
  it('warns with provider and model when a keyed client has no tenant', () => {
    new AIProviderClient({
      provider: 'gemini',
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });

    expect(loggerMock.warn).toHaveBeenCalledWith({
      event: 'ai_client_untenanted',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
    }, 'AI client initialized without tenant context');
  });

  it('does not emit the untenant warning when tenant context is present', () => {
    new AIProviderClient({
      provider: 'gemini',
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
      tenantId: 'tenant-1',
    });

    expect(loggerMock.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ai_client_untenanted' }),
      expect.any(String),
    );
  });
});

/**
 * ICW-13 AC2: the AI edit path now routes through AIProviderClient, so transient
 * provider errors are retried per its policy and hard failures propagate.
 */
describe('AIProviderClient retry policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeClient(provider: Partial<IAIProvider>): AIProviderClient {
    const client = new AIProviderClient({
      provider: 'gemini',
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
    });
    // Inject a stub provider so we control generateResponse without the SDK.
    (client as unknown as { provider: Partial<IAIProvider> }).provider = provider;
    return client;
  }

  it('retries a transient rate-limit error, then returns the successful response', async () => {
    const generateResponse = vi.fn<IAIProvider['generateResponse']>()
      .mockRejectedValueOnce(new AIError('rate limited', 'RATE_LIMIT', {}, true))
      .mockResolvedValueOnce({ text: '{"ok":true}' });

    const client = makeClient({ generateResponse });
    const promise = client.callLLM('prompt', 'workflow_revision', 'system');
    // Let the backoff timer + subsequent attempt resolve.
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('{"ok":true}');
    expect(generateResponse).toHaveBeenCalledTimes(2);
  });

  it('propagates a hard API error without retrying', async () => {
    const generateResponse = vi.fn<IAIProvider['generateResponse']>()
      .mockRejectedValue(new AIError('boom', 'API_ERROR'));

    const client = makeClient({ generateResponse });
    const promise = client.callLLM('prompt', 'workflow_revision');

    await expect(promise).rejects.toBeInstanceOf(AIError);
    expect(generateResponse).toHaveBeenCalledTimes(1);
  });
});

/**
 * ICW2-B7: per-tenant AI usage recording + budget enforcement at the
 * `callLLM` choke point. `tenantId` is optional on the config, so every case
 * below also proves the no-`tenantId` (pre-ICW2-B7 caller) path is untouched.
 */
describe('AIProviderClient usage & budget (ICW2-B7)', () => {
  function makeFakeRepo(usedTokens = 0, usedCostUsd = 0) {
    const recordUsage = vi.fn<AiUsageRepository['recordUsage']>()
      .mockResolvedValue({} as AiUsage);
    const getTokenUsageSince = vi.fn<AiUsageRepository['getTokenUsageSince']>()
      .mockResolvedValue(usedTokens);
    const getCostUsdSince = vi.fn<AiUsageRepository['getCostUsdSince']>()
      .mockResolvedValue(usedCostUsd);
    const repo = { recordUsage, getTokenUsageSince, getCostUsdSince } as unknown as AiUsageRepository;
    return { repo, recordUsage, getTokenUsageSince, getCostUsdSince };
  }

  function makeClientWithRepo(
    provider: Partial<IAIProvider>,
    repo: AiUsageRepository,
    tenantId?: string,
  ): AIProviderClient {
    const client = new AIProviderClient(
      { provider: 'gemini', apiKey: 'test-key', model: 'gemini-2.0-flash', tenantId },
      repo,
    );
    (client as unknown as { provider: Partial<IAIProvider> }).provider = provider;
    return client;
  }

  it('persists real provider usage per tenant, not the char/4 estimate (AC1)', async () => {
    const generateResponse = vi.fn<IAIProvider['generateResponse']>()
      .mockResolvedValueOnce({ text: '{"ok":true}', usage: { inputTokens: 500, outputTokens: 300 } });
    const { repo, recordUsage } = makeFakeRepo(0, 0);

    const client = makeClientWithRepo({ generateResponse }, repo, 'tenant-1');
    const text = await client.callLLM('a short prompt', 'workflow_generation');

    expect(text).toBe('{"ok":true}');
    expect(recordUsage).toHaveBeenCalledTimes(1);
    const recorded = recordUsage.mock.calls[0][0];
    expect(recorded).toMatchObject({
      tenantId: 'tenant-1',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      taskType: 'workflow_generation',
      inputTokens: 500,
      outputTokens: 300,
    });
    // Real usage (500/300), never the char/4 estimate of the short test prompt/response.
    expect(recorded.inputTokens).not.toBe(estimateTokenCount('a short prompt'));
    expect(recorded.costUsd).toBeGreaterThan(0);
  });

  it('records random-fill usage against the requesting tenant (AISL-2 AC5)', async () => {
    const generateResponse = vi.fn<IAIProvider['generateResponse']>()
      .mockResolvedValue({
        text: JSON.stringify({ values: { email: 'random@example.com' } }),
        usage: { inputTokens: 120, outputTokens: 20 },
      });
    vi.spyOn(ProviderFactory, 'createProvider').mockReturnValue({
      generateResponse,
    } as unknown as IAIProvider);

    const getTokenUsageSince = vi.spyOn(aiUsageRepository, 'getTokenUsageSince')
      .mockResolvedValue(0);
    vi.spyOn(aiUsageRepository, 'getCostUsdSince').mockResolvedValue(0);
    const recordUsage = vi.spyOn(aiUsageRepository, 'recordUsage')
      .mockResolvedValue({} as AiUsage);
    const randomFillStep = {
      id: 'step-email',
      alias: 'email',
      title: 'Email address',
      type: 'email',
      config: null,
      description: null,
      isVirtual: false,
    } as Step;
    const randomFillStepRepo = {
      findByWorkflowIdWithAliases: vi.fn().mockResolvedValue([randomFillStep]),
    } as unknown as typeof stepRepository;
    const lifecycleService = new RunLifecycleService(undefined, randomFillStepRepo);

    await expect(
      lifecycleService.generateRandomValues('workflow-1', 'tenant-random-fill'),
    ).resolves.toEqual({ email: 'random@example.com' });

    expect(getTokenUsageSince).toHaveBeenCalledWith(
      'tenant-random-fill',
      expect.any(Date),
    expect.anything(),
    );
    expect(recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-random-fill',
      taskType: 'value_suggestion',
      inputTokens: 120,
      outputTokens: 20,
    }), expect.anything());
  });

  it('falls back to the char/4 estimate only when the provider omits usage (AC4)', async () => {
    const prompt = 'a prompt with no provider usage metadata';
    const responseText = 'plain response text';
    const generateResponse = vi.fn<IAIProvider['generateResponse']>()
      .mockResolvedValueOnce({ text: responseText }); // usage omitted entirely
    const { repo, recordUsage } = makeFakeRepo(0, 0);

    const client = makeClientWithRepo({ generateResponse }, repo, 'tenant-2');
    await client.callLLM(prompt, 'workflow_generation');

    const recorded = recordUsage.mock.calls[0][0];
    expect(recorded.inputTokens).toBe(estimateTokenCount(prompt));
    expect(recorded.outputTokens).toBe(estimateTokenCount(responseText));
  });

  it('fails closed with BUDGET_EXCEEDED and never calls the provider once over token budget (AC2/AC6)', async () => {
    const generateResponse = vi.fn<IAIProvider['generateResponse']>()
      .mockResolvedValueOnce({ text: 'should never be reached' });
    const { repo, recordUsage } = makeFakeRepo(LIMITS.AI_TENANT_MONTHLY_TOKEN_BUDGET, 0); // exactly at the token cap, under dollar limit

    const client = makeClientWithRepo({ generateResponse }, repo, 'tenant-over-budget');

    await expect(client.callLLM('prompt', 'workflow_generation')).rejects.toMatchObject({
      code: 'BUDGET_EXCEEDED',
    });
    expect(generateResponse).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('succeeds normally for a tenant under both budgets (AC2)', async () => {
    const generateResponse = vi.fn<IAIProvider['generateResponse']>()
      .mockResolvedValueOnce({ text: '{"ok":true}', usage: { inputTokens: 10, outputTokens: 10 } });
    const { repo, recordUsage } = makeFakeRepo(LIMITS.AI_TENANT_MONTHLY_TOKEN_BUDGET - 1000, 0);

    const client = makeClientWithRepo({ generateResponse }, repo, 'tenant-under-budget');
    await expect(client.callLLM('prompt', 'workflow_generation')).resolves.toBe('{"ok":true}');
    expect(recordUsage).toHaveBeenCalledTimes(1);
  });

  it('never checks or records usage when the config carries no tenantId — existing callers untouched (AC3)', async () => {
    const generateResponse = vi.fn<IAIProvider['generateResponse']>()
      .mockResolvedValueOnce({ text: 'ok', usage: { inputTokens: 1, outputTokens: 1 } });
    // A repo that would fail the budget check if it were ever consulted.
    const { repo, recordUsage, getTokenUsageSince, getCostUsdSince } = makeFakeRepo(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

    const client = makeClientWithRepo({ generateResponse }, repo, undefined);
    await expect(client.callLLM('prompt', 'workflow_generation')).resolves.toBe('ok');

    expect(getTokenUsageSince).not.toHaveBeenCalled();
    expect(getCostUsdSince).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  describe('AISL-9 dollar-based budget tiers', () => {
    it('logs ai_budget_warning at/above the warn threshold and allows the call (AC3)', async () => {
      const generateResponse = vi.fn<IAIProvider['generateResponse']>().mockResolvedValue({ text: 'ok' });
      // Exactly at the warn threshold
      const warnCents = LIMITS.AI_TENANT_BUDGET_WARN_CENTS;
      const { repo } = makeFakeRepo(0, warnCents / 100);

      const client = makeClientWithRepo({ generateResponse }, repo, 'tenant-warn');
      await client.callLLM('prompt', 'workflow_generation');

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ai_budget_warning' }),
        expect.any(String),
      );
      expect(generateResponse).toHaveBeenCalled();
    });

    it('logs ai_budget_throttled at/above the throttle threshold and allows the call (AC4)', async () => {
      const generateResponse = vi.fn<IAIProvider['generateResponse']>().mockResolvedValue({ text: 'ok' });
      // Exactly at the throttle threshold
      const throttleCents = LIMITS.AI_TENANT_BUDGET_THROTTLE_CENTS;
      const { repo } = makeFakeRepo(0, throttleCents / 100);

      const client = makeClientWithRepo({ generateResponse }, repo, 'tenant-throttle');
      await client.callLLM('prompt', 'workflow_generation');

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ai_budget_throttled' }),
        expect.any(String),
      );
      expect(generateResponse).toHaveBeenCalled();
    });

    it('throws BUDGET_EXCEEDED at/above the hard limit (AC5)', async () => {
      const generateResponse = vi.fn<IAIProvider['generateResponse']>().mockResolvedValue({ text: 'ok' });
      const hardCents = LIMITS.AI_TENANT_BUDGET_USD_CENTS;
      const { repo } = makeFakeRepo(0, hardCents / 100);

      const client = makeClientWithRepo({ generateResponse }, repo, 'tenant-hard');
      await expect(client.callLLM('prompt', 'workflow_generation')).rejects.toMatchObject({
        code: 'BUDGET_EXCEEDED',
      });

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ai_budget_exceeded' }),
        expect.any(String),
      );
      expect(generateResponse).not.toHaveBeenCalled();
    });
  });
});

/**
 * ICW2-B7 AC3: the budget default is env-configurable and generous — an
 * unset env must never break existing flows.
 */
describe('shared/limits AI_TENANT_MONTHLY_TOKEN_BUDGET (ICW2-B7 AC3)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to a generous value when unset', async () => {
    vi.resetModules();
    const { LIMITS: freshLimits } = await import('@shared/limits');
    expect(freshLimits.AI_TENANT_MONTHLY_TOKEN_BUDGET).toBe(20_000_000);
  });

  it('is overridable via env', async () => {
    vi.resetModules();
    vi.stubEnv('AI_TENANT_MONTHLY_TOKEN_BUDGET', '12345');
    const { LIMITS: freshLimits } = await import('@shared/limits');
    expect(freshLimits.AI_TENANT_MONTHLY_TOKEN_BUDGET).toBe(12345);
  });

  it('falls back to the default on a garbage env value (never silently disables the cap)', async () => {
    vi.resetModules();
    vi.stubEnv('AI_TENANT_MONTHLY_TOKEN_BUDGET', 'not-a-number');
    const { LIMITS: freshLimits } = await import('@shared/limits');
    expect(freshLimits.AI_TENANT_MONTHLY_TOKEN_BUDGET).toBe(20_000_000);
  });
});
