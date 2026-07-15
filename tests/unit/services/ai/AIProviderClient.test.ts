import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AIError } from '../../../../server/services/ai/AIError';
import { AIProviderClient } from '../../../../server/services/ai/AIProviderClient';

import type { IAIProvider } from '../../../../server/services/ai/providers/types';

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
      .mockResolvedValueOnce('{"ok":true}');

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
