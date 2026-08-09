import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAIServiceFromEnv } from '../../../../server/services/AIService';
import { ProviderFactory } from '../../../../server/services/ai/providers/ProviderFactory';
import { resolveAiProviderConfig } from '../../../../server/services/ai/providerConfig';

const { mockAnthropicCreate } = vi.hoisted(() => ({
  mockAnthropicCreate: vi.fn<
    (payload: Record<string, unknown>) => Promise<unknown>
  >(),
}));

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockAnthropicCreate };
  }

  return { default: MockAnthropic };
});

describe('Anthropic provider compatibility', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    mockAnthropicCreate.mockReset();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    process.env.AI_API_KEY = 'anthropic-key';
    process.env.AI_PROVIDER = 'anthropic';
    delete process.env.AI_MODEL_WORKFLOW;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    vi.restoreAllMocks();
  });

  it('sends the configured model without unsupported sampling parameters', async () => {
    const { AnthropicProvider } = await import(
      '../../../../server/services/ai/providers/AnthropicProvider'
    );
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"ok":true}' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const provider = new AnthropicProvider({
      provider: 'anthropic',
      apiKey: 'anthropic-key',
      model: 'claude-opus-4-8',
      temperature: 0.9,
    });

    await provider.generateResponse('prompt', 'workflow_generation');

    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-8' }),
    );
    const payload = mockAnthropicCreate.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty('temperature');
    expect(payload).not.toHaveProperty('top_p');
    expect(payload).not.toHaveProperty('top_k');
  });

  it('keeps both Anthropic configuration paths on the same default model', () => {
    const createProvider = vi.spyOn(ProviderFactory, 'createProvider');
    const resolved = resolveAiProviderConfig({ provider: 'anthropic' });

    createAIServiceFromEnv();

    expect(resolved.model).toBe('claude-sonnet-5');
    expect(createProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'anthropic',
        model: resolved.model,
      }),
    );
  });
});
