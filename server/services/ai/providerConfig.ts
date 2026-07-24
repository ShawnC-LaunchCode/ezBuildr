/**
 * AI provider config resolution from environment.
 *
 * Single source of truth for turning the deployment's env vars into an
 * `AIProviderConfig` for `AIProviderClient`. Mirrors the convention in
 * `createAIServiceFromEnv` (`AIService.ts`): prefer `GEMINI_API_KEY` /
 * `GEMINI_MODEL`, otherwise fall back to `AI_API_KEY` + `AI_PROVIDER`.
 *
 * Model ids default to registry-known values so telemetry cost/context checks
 * resolve to real pricing rather than the ModelRegistry "unknown" fallback.
 *
 * `overrides` already accepts `tenantId` (ICW2-B7) since it's typed as
 * `Partial<AIProviderConfig>` and `AIProviderConfig.tenantId` is optional —
 * callers pass `resolveAiProviderConfig({ tenantId, ... })` to have
 * `AIProviderClient` budget/record usage for that tenant.
 */

import type { AIProvider, AIProviderConfig } from '../../../shared/types/ai';

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: DEFAULT_GEMINI_MODEL,
  openai: 'gpt-4-turbo-preview',
  anthropic: 'claude-3-5-sonnet-20241022',
};

/**
 * Resolve an `AIProviderConfig` from environment variables.
 *
 * @param overrides Per-call overrides (e.g. `maxTokens`) applied last.
 * @throws if no provider API key is configured.
 */
export function resolveAiProviderConfig(
  overrides: Partial<AIProviderConfig> = {},
): AIProviderConfig {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    return {
      provider: 'gemini',
      apiKey: geminiKey,
      model: process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
      temperature: 0.7,
      maxTokens: 4000,
      ...overrides,
    };
  }

  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'No AI provider API key configured. Set GEMINI_API_KEY or AI_API_KEY.',
    );
  }

  const provider = (process.env.AI_PROVIDER ?? 'openai') as AIProvider;
  const model =
    process.env.AI_MODEL_WORKFLOW ??
    DEFAULT_MODELS[provider] ??
    DEFAULT_MODELS.openai;

  return {
    provider,
    apiKey,
    model,
    temperature: 0.7,
    maxTokens: 4000,
    ...overrides,
  };
}
