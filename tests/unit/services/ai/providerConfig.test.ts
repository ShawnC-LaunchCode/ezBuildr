import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { resolveAiProviderConfig } from '../../../../server/services/ai/providerConfig';

/**
 * ICW-13: single source of truth for turning env vars into an AIProviderConfig.
 * Model selection reads GEMINI_MODEL with a registry-known default; no hardcoded
 * model pin.
 */
describe('resolveAiProviderConfig', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.AI_API_KEY;
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL_WORKFLOW;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('prefers GEMINI_API_KEY with the registry-known default model', () => {
    process.env.GEMINI_API_KEY = 'g-key';
    const config = resolveAiProviderConfig();
    expect(config).toMatchObject({ provider: 'gemini', apiKey: 'g-key', model: 'gemini-2.0-flash' });
  });

  it('honors GEMINI_MODEL override', () => {
    process.env.GEMINI_API_KEY = 'g-key';
    process.env.GEMINI_MODEL = 'gemini-2.5-pro';
    expect(resolveAiProviderConfig().model).toBe('gemini-2.5-pro');
  });

  it('applies per-call overrides last', () => {
    process.env.GEMINI_API_KEY = 'g-key';
    expect(resolveAiProviderConfig({ maxTokens: 8192 }).maxTokens).toBe(8192);
  });

  it('threads an optional tenantId through overrides (ICW2-B7)', () => {
    process.env.GEMINI_API_KEY = 'g-key';
    expect(resolveAiProviderConfig({ tenantId: 'tenant-123' }).tenantId).toBe('tenant-123');
    // Callers that don't pass one (not yet wired) keep working with none set.
    expect(resolveAiProviderConfig().tenantId).toBeUndefined();
  });

  it('falls back to AI_API_KEY + AI_PROVIDER when no Gemini key', () => {
    process.env.AI_API_KEY = 'o-key';
    process.env.AI_PROVIDER = 'openai';
    const config = resolveAiProviderConfig();
    expect(config).toMatchObject({ provider: 'openai', apiKey: 'o-key', model: 'gpt-4-turbo-preview' });
  });

  it('throws when no provider key is configured', () => {
    expect(() => resolveAiProviderConfig()).toThrow(/No AI provider API key/);
  });
});
