import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ICW2-B7 AC1/AC4: each provider must read the SDK's real token usage instead
 * of discarding it, mapping provider-specific field names onto the shared
 * `{ inputTokens, outputTokens }` shape — and must leave `usage` undefined
 * (not fabricate numbers) when the SDK genuinely omits it, so
 * `AIProviderClient` can apply its char/4 estimate fallback.
 *
 * These mocks intentionally override the generic defaults `tests/setup-fast.ts`
 * installs for these same packages, so each test controls the exact usage
 * numbers returned by the SDK.
 */

// Real classes, not `vi.fn().mockImplementation(() => …)` — providers call
// `new Anthropic(...)` / `new OpenAI(...)` / `new GoogleGenerativeAI(...)`,
// and an arrow-function mock is not a constructor (mirrors the same
// requirement documented in tests/setup-fast.ts for these same packages).
const { mockAnthropicCreate } = vi.hoisted(() => ({ mockAnthropicCreate: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockAnthropicCreate };
  }
  return { default: MockAnthropic };
});

const { mockOpenAiCreate } = vi.hoisted(() => ({ mockOpenAiCreate: vi.fn() }));
vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: mockOpenAiCreate } };
  }
  return { default: MockOpenAI };
});

const { mockGeminiGenerateContent } = vi.hoisted(() => ({ mockGeminiGenerateContent: vi.fn() }));
vi.mock('@google/generative-ai', () => {
  class MockGoogleGenerativeAI {
    getGenerativeModel() {
      return { generateContent: mockGeminiGenerateContent };
    }
  }
  return { GoogleGenerativeAI: MockGoogleGenerativeAI };
});

describe('provider real-usage extraction (ICW2-B7)', () => {
  beforeEach(() => {
    mockAnthropicCreate.mockReset();
    mockOpenAiCreate.mockReset();
    mockGeminiGenerateContent.mockReset();
  });

  it('AnthropicProvider maps response.usage.input_tokens/output_tokens', async () => {
    const { AnthropicProvider } = await import('../../../../server/services/ai/providers/AnthropicProvider');
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"a":1}' }],
      usage: { input_tokens: 123, output_tokens: 456 },
    });

    const provider = new AnthropicProvider({ provider: 'anthropic', apiKey: 'k', model: 'claude-3-5-sonnet-20241022' });
    const result = await provider.generateResponse('prompt', 'workflow_generation');

    expect(result.text).toBe('{"a":1}');
    expect(result.usage).toEqual({ inputTokens: 123, outputTokens: 456 });
  });

  // Note: Anthropic's SDK type guarantees `usage` on every response (unlike
  // Gemini/OpenAI, where it's optional) — see AnthropicProvider.ts — so there
  // is no "SDK omits usage" case to test here. AIProviderClient's own
  // `usage ?? estimate` is the universal safety net for all three providers.

  it('OpenAIProvider maps response.usage.prompt_tokens/completion_tokens', async () => {
    const { OpenAIProvider } = await import('../../../../server/services/ai/providers/OpenAIProvider');
    mockOpenAiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"b":2}' } }],
      usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
    });

    const provider = new OpenAIProvider({ provider: 'openai', apiKey: 'k', model: 'gpt-4-turbo-preview' });
    const result = await provider.generateResponse('prompt', 'workflow_generation');

    expect(result.text).toBe('{"b":2}');
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 80 });
  });

  it('OpenAIProvider leaves usage undefined when the SDK omits it (fallback signal)', async () => {
    const { OpenAIProvider } = await import('../../../../server/services/ai/providers/OpenAIProvider');
    mockOpenAiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'no usage field' } }],
    });

    const provider = new OpenAIProvider({ provider: 'openai', apiKey: 'k', model: 'gpt-4-turbo-preview' });
    const result = await provider.generateResponse('prompt', 'workflow_generation');

    expect(result.text).toBe('no usage field');
    expect(result.usage).toBeUndefined();
  });

  it('GeminiProvider maps usageMetadata.promptTokenCount/candidatesTokenCount', async () => {
    const { GeminiProvider } = await import('../../../../server/services/ai/providers/GeminiProvider');
    mockGeminiGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '{"c":3}',
        usageMetadata: { promptTokenCount: 55, candidatesTokenCount: 44, totalTokenCount: 99 },
      },
    });

    const provider = new GeminiProvider({ provider: 'gemini', apiKey: 'k', model: 'gemini-2.0-flash' });
    const result = await provider.generateResponse('prompt', 'workflow_generation');

    expect(result.text).toBe('{"c":3}');
    expect(result.usage).toEqual({ inputTokens: 55, outputTokens: 44 });
  });

  it('GeminiProvider leaves usage undefined when usageMetadata is omitted (fallback signal)', async () => {
    const { GeminiProvider } = await import('../../../../server/services/ai/providers/GeminiProvider');
    mockGeminiGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'no usage field' },
    });

    const provider = new GeminiProvider({ provider: 'gemini', apiKey: 'k', model: 'gemini-2.0-flash' });
    const result = await provider.generateResponse('prompt', 'workflow_generation');

    expect(result.text).toBe('no usage field');
    expect(result.usage).toBeUndefined();
  });
});
