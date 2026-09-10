import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveAiProviderConfig } from '../../../../server/services/ai/providerConfig';

import { validateAIConfig } from '../../../../server/services/AIService';
import { ModelRegistry } from '../../../../server/services/ai/ModelRegistry';
import { TASK_TYPES, type TaskType } from '../../../../server/services/ai/types';

describe('ModelRegistry task token caps', () => {
  it('returns the configured cap for every task type', () => {
    const expectedCaps = {
      workflow_generation: 8000,
      workflow_suggestion: 4000,
      binding_suggestion: 4000,
      value_suggestion: 4000,
      workflow_revision: 8192,
      logic_generation: 4000,
      logic_debug: 4000,
      logic_visualization: 4000,
      personalization: 1000,
      document_analysis: 4000,
      document_mapping: 4000,
      sentiment_analysis: 500,
    } satisfies Record<TaskType, number>;

    for (const taskType of TASK_TYPES) {
      const configuredCap = ModelRegistry.getTaskMaxTokens(taskType);

      expect(configuredCap).toBe(expectedCaps[taskType]);
      expect(configuredCap).toBeGreaterThan(0);
    }
  });
});

describe('ModelRegistry registration', () => {
  it('reports registered and unregistered provider/model pairs explicitly', () => {
    expect(ModelRegistry.isRegistered('anthropic', 'claude-sonnet-5')).toBe(true);
    expect(ModelRegistry.isRegistered('anthropic', 'claude-3-5-sonnet-20241022')).toBe(false);
    expect(ModelRegistry.isRegistered('openai', 'gpt-not-released-yet')).toBe(false);
  });

  it('contains current sourced configurations for all three providers', () => {
    expect(ModelRegistry.getConfig('openai', 'gpt-5.6-terra')).toMatchObject({
      maxContextTokens: 1050000,
      pricing: { input: 2.00, output: 12.00 },
    });
    expect(ModelRegistry.getConfig('anthropic', 'claude-sonnet-5')).toMatchObject({
      maxContextTokens: 1000000,
      pricing: { input: 3.00, output: 15.00 },
    });
    expect(ModelRegistry.getConfig('gemini', 'gemini-2.5-flash-lite')).toMatchObject({
      maxContextTokens: 1048576,
      pricing: { input: 0.10, output: 0.40 },
    });
  });

  // Regression guard (AISL-1 review, rev 2). A cleanup pass removed these two
  // rows for being vendor-deprecated while seven files still selected them,
  // which silently swapped in getDefaultConfig's guessed context window (1M vs
  // gemini-1.5-pro's real 2M, so large transform prompts began hard-throwing)
  // and its guessed pricing (12x under-reporting). A model stays registered for
  // as long as any code path can select it.
  it('registers whatever model the app actually defaults to (AI-P1)', () => {
    // DERIVED, never pinned. The previous version of this test hardcoded
    // gemini-2.0-flash "because it is the default" — so when the default moved it
    // asserted a fact about a retired model and told nobody. Ask the real
    // resolution path what it would use, with no GEMINI_MODEL set, and require
    // THAT to be registered.
    const saved = { ...process.env };
    try {
      delete process.env.GEMINI_MODEL;
      process.env.GEMINI_API_KEY = 'test-key';
      const { model, provider } = resolveAiProviderConfig();
      expect(provider).toBe('gemini');
      expect(ModelRegistry.isRegistered('gemini', model)).toBe(true);
      // And it must not be one of the models the vendor has withdrawn.
      expect(['gemini-2.0-flash', 'gemini-1.5-pro']).not.toContain(model);
    } finally {
      process.env = { ...saved };
    }
  });

  it('keeps the withdrawn models registered so historical usage rows still price', () => {
    // Retained for `ai_usage` history only — nothing selects either any more.
    // 2M context and the real rate, not getDefaultConfig's 1M / $0.10 / $0.40.
    expect(ModelRegistry.isRegistered('gemini', 'gemini-2.0-flash')).toBe(true);
    expect(ModelRegistry.getConfig('gemini', 'gemini-1.5-pro')).toMatchObject({
      maxContextTokens: 2097152,
      pricing: { input: 1.25, output: 5.00 },
    });
  });

  it('retains the documented OpenAI fallback for an unregistered model', () => {
    expect(ModelRegistry.getConfig('openai', 'gpt-not-released-yet')).toEqual({
      provider: 'openai',
      model: 'unknown',
      maxContextTokens: 8000,
      pricing: { input: 10.00, output: 30.00 },
    });
  });
});

describe('validateAIConfig model registration', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
    delete process.env.AI_API_KEY;
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL_WORKFLOW;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('returns configured true with no error for a registered model', () => {
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_MODEL_WORKFLOW = 'gpt-5.6-sol';

    expect(validateAIConfig()).toEqual({
      configured: true,
      provider: 'openai',
      model: 'gpt-5.6-sol',
      error: undefined,
    });
  });

  // The live production shape: GEMINI_API_KEY set, GEMINI_MODEL unset, so the
  // deployment runs providerConfig's DEFAULT_GEMINI_MODEL. This must boot with
  // no error — otherwise the "model is not registered" warning fires on every
  // production start for the model actually in use and stops meaning anything.
  it('reports no error for the default Gemini deployment', () => {
    process.env.GEMINI_API_KEY = 'test-key';

    const result = validateAIConfig();

    expect(result.configured).toBe(true);
    expect(result.provider).toBe('gemini');
    expect(result.error).toBeUndefined();
  });

  it('keeps an unregistered model configured while returning an actionable error', () => {
    process.env.AI_API_KEY = 'test-key';
    process.env.AI_PROVIDER = 'openai';
    process.env.AI_MODEL_WORKFLOW = 'gpt-not-released-yet';

    const result = validateAIConfig();

    expect(result.configured).toBe(true);
    expect(result.provider).toBe('openai');
    expect(result.model).toBe('gpt-not-released-yet');
    expect(result.error).toContain('gpt-not-released-yet');
    expect(result.error).toContain('Registered models:');
  });
});
