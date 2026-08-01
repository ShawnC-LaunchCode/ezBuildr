import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { LIMITS } from '@shared/limits';

import { AIError } from '../../../../server/services/ai/AIError';
import { AIProviderClient } from '../../../../server/services/ai/AIProviderClient';
import { estimateTokenCount } from '../../../../server/services/ai/AIServiceUtils';

import type { AiUsageRepository } from '../../../../server/repositories/AiUsageRepository';
import type { IAIProvider } from '../../../../server/services/ai/providers/types';
import type { AiUsage } from '../../../../shared/schema';

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
  function makeFakeRepo(usedTokens = 0) {
    const recordUsage = vi.fn<AiUsageRepository['recordUsage']>()
      .mockResolvedValue({} as AiUsage);
    const getTokenUsageSince = vi.fn<AiUsageRepository['getTokenUsageSince']>()
      .mockResolvedValue(usedTokens);
    const repo = { recordUsage, getTokenUsageSince } as unknown as AiUsageRepository;
    return { repo, recordUsage, getTokenUsageSince };
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
    const { repo, recordUsage } = makeFakeRepo(0);

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

  it('falls back to the char/4 estimate only when the provider omits usage (AC4)', async () => {
    const prompt = 'a prompt with no provider usage metadata';
    const responseText = 'plain response text';
    const generateResponse = vi.fn<IAIProvider['generateResponse']>()
      .mockResolvedValueOnce({ text: responseText }); // usage omitted entirely
    const { repo, recordUsage } = makeFakeRepo(0);

    const client = makeClientWithRepo({ generateResponse }, repo, 'tenant-2');
    await client.callLLM(prompt, 'workflow_generation');

    const recorded = recordUsage.mock.calls[0][0];
    expect(recorded.inputTokens).toBe(estimateTokenCount(prompt));
    expect(recorded.outputTokens).toBe(estimateTokenCount(responseText));
  });

  it('fails closed with BUDGET_EXCEEDED and never calls the provider once over budget (AC2)', async () => {
    const generateResponse = vi.fn<IAIProvider['generateResponse']>()
      .mockResolvedValueOnce({ text: 'should never be reached' });
    const { repo, recordUsage } = makeFakeRepo(LIMITS.AI_TENANT_MONTHLY_TOKEN_BUDGET); // exactly at the cap

    const client = makeClientWithRepo({ generateResponse }, repo, 'tenant-over-budget');

    await expect(client.callLLM('prompt', 'workflow_generation')).rejects.toMatchObject({
      code: 'BUDGET_EXCEEDED',
    });
    expect(generateResponse).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('succeeds normally for a tenant under budget (AC2)', async () => {
    const generateResponse = vi.fn<IAIProvider['generateResponse']>()
      .mockResolvedValueOnce({ text: '{"ok":true}', usage: { inputTokens: 10, outputTokens: 10 } });
    const { repo, recordUsage } = makeFakeRepo(LIMITS.AI_TENANT_MONTHLY_TOKEN_BUDGET - 1000);

    const client = makeClientWithRepo({ generateResponse }, repo, 'tenant-under-budget');
    await expect(client.callLLM('prompt', 'workflow_generation')).resolves.toBe('{"ok":true}');
    expect(recordUsage).toHaveBeenCalledTimes(1);
  });

  it('never checks or records usage when the config carries no tenantId — existing callers untouched (AC3)', async () => {
    const generateResponse = vi.fn<IAIProvider['generateResponse']>()
      .mockResolvedValueOnce({ text: 'ok', usage: { inputTokens: 1, outputTokens: 1 } });
    // A repo that would fail the budget check if it were ever consulted.
    const { repo, recordUsage, getTokenUsageSince } = makeFakeRepo(Number.MAX_SAFE_INTEGER);

    const client = makeClientWithRepo({ generateResponse }, repo, undefined);
    await expect(client.callLLM('prompt', 'workflow_generation')).resolves.toBe('ok');

    expect(getTokenUsageSince).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
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
