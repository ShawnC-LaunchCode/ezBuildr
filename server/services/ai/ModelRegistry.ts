/**
 * Model Registry
 *
 * Centralized registry for all AI model configurations including:
 * - Context window limits
 * - Token pricing (per 1M tokens)
 * - Default max tokens for different task types
 */

import type { TaskType } from './types';
import type { AIProvider } from '../../../shared/types/ai';

export interface ModelConfig {
  provider: AIProvider;
  model: string;
  maxContextTokens: number;
  pricing: {
    input: number;  // USD per 1M tokens
    output: number; // USD per 1M tokens
  };
}

/**
 * Task-specific max output tokens
 * These are conservative defaults to leave room for prompts
 */

export const TASK_MAX_TOKENS: Record<TaskType, number> = {
  workflow_generation: 8000,
  workflow_revision: 8192,
  workflow_suggestion: 4000,
  binding_suggestion: 4000,
  value_suggestion: 4000,
  logic_generation: 4000,
  logic_debug: 4000,
  logic_visualization: 4000,
  transform_generation: 4000,
  transform_revision: 4000,
  transform_schema_align: 4000,
  personalization: 1000,
  document_analysis: 4000,
  document_mapping: 4000,
  sentiment_analysis: 500,
};


/**
 * Comprehensive model configurations
 *
 * OpenAI and Gemini model IDs, context windows, and standard per-1M-token
 * prices were retrieved 2026-08-09 from their official live model/pricing
 * pages. Anthropic entries use the authoritative current table supplied in the
 * AISL-1 review dated 2026-08-09. Tiered long-context pricing is intentionally
 * not represented because ModelConfig supports one input and one output rate.
 */
const MODEL_CONFIGS: ModelConfig[] = [
  // OpenAI Models
  {
    provider: 'openai',
    model: 'gpt-5.6',
    maxContextTokens: 1050000,
    pricing: { input: 5.00, output: 30.00 },
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-sol',
    maxContextTokens: 1050000,
    pricing: { input: 5.00, output: 30.00 },
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    maxContextTokens: 1050000,
    pricing: { input: 2.00, output: 12.00 },
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-luna',
    maxContextTokens: 1050000,
    pricing: { input: 0.20, output: 1.20 },
  },

  // Anthropic Models
  {
    provider: 'anthropic',
    model: 'claude-fable-5',
    maxContextTokens: 1000000,
    pricing: { input: 10.00, output: 50.00 },
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-5',
    maxContextTokens: 1000000,
    pricing: { input: 5.00, output: 25.00 },
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-4-8',
    maxContextTokens: 1000000,
    pricing: { input: 5.00, output: 25.00 },
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    maxContextTokens: 1000000,
    pricing: { input: 5.00, output: 25.00 },
  },
  {
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    maxContextTokens: 1000000,
    pricing: { input: 5.00, output: 25.00 },
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    maxContextTokens: 1000000,
    // Use the standard rate; the $2/$10 introductory rate ends 2026-08-31.
    pricing: { input: 3.00, output: 15.00 },
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    maxContextTokens: 1000000,
    pricing: { input: 3.00, output: 15.00 },
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    maxContextTokens: 200000,
    pricing: { input: 1.00, output: 5.00 },
  },

  // Gemini Models
  {
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    maxContextTokens: 1048576,
    pricing: { input: 1.50, output: 7.50 },
  },
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    maxContextTokens: 1048576,
    pricing: { input: 1.50, output: 9.00 },
  },
  {
    provider: 'gemini',
    model: 'gemini-3.5-flash-lite',
    maxContextTokens: 1048576,
    pricing: { input: 0.30, output: 2.50 },
  },
  {
    provider: 'gemini',
    model: 'gemini-3.1-flash-lite',
    maxContextTokens: 1048576,
    pricing: { input: 0.25, output: 1.50 },
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    maxContextTokens: 1048576, // 1M tokens
    pricing: { input: 1.25, output: 10.00 },
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    maxContextTokens: 1048576,
    pricing: { input: 0.30, output: 2.50 },
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash-lite',
    maxContextTokens: 1048576,
    pricing: { input: 0.10, output: 0.40 },
  },

  // Vendor-deprecated, but RETAINED because ezBuildr still selects them.
  // The registry's contract is "models this deployment might call", not
  // "models the vendor currently sells" — a model can be deprecated upstream
  // and still be the configured default here, and dropping its row silently
  // swaps in `getDefaultConfig`'s guessed context window and pricing.
  //   - gemini-2.0-flash is DEFAULT_GEMINI_MODEL (providerConfig.ts) and the
  //     `GEMINI_MODEL ?? ...` fallback across AIService/geminiService/
  //     personalization/DocumentAIAssistService/schemaAlign/AiController.
  //   - gemini-1.5-pro is hardcoded in transformGenerator/transformRevision;
  //     AISL-5 removes those, after which this row may be reconsidered.
  // Do not delete either while any code path can still select it — see the
  // AISL-1 review notes in tickets/backlog/AI_SERVICE_LAYER.md.
  {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    maxContextTokens: 1048576,
    pricing: { input: 0.10, output: 0.40 },
  },
  {
    provider: 'gemini',
    model: 'gemini-1.5-pro',
    maxContextTokens: 2097152, // 2M tokens
    pricing: { input: 1.25, output: 5.00 },
  },
];

/**
 * Model Registry - Single source of truth for model configurations
 */
export class ModelRegistry {
  private static configMap = new Map<string, ModelConfig>();
  private static initialized = false;

  /**
   * Initialize the registry (called once)
   */
  private static initialize(): void {
    if (this.initialized) {return;}

    for (const config of MODEL_CONFIGS) {
      const key = `${config.provider}:${config.model}`;
      this.configMap.set(key, config);
    }

    this.initialized = true;
  }

  /**
   * Get model configuration
   */
  static getConfig(provider: AIProvider, model: string): ModelConfig {
    this.initialize();

    const key = `${provider}:${model}`;
    const config = this.configMap.get(key);

    if (!config) {
      // Return reasonable defaults for unknown models
      return this.getDefaultConfig(provider);
    }

    return config;
  }

  /**
   * Check whether a provider/model pair has an explicit registry entry.
   */
  static isRegistered(provider: AIProvider, model: string): boolean {
    this.initialize();

    return this.configMap.has(`${provider}:${model}`);
  }

  /**
   * Get default configuration for a provider (fallback)
   */
  private static getDefaultConfig(provider: AIProvider): ModelConfig {
    switch (provider) {
      case 'openai':
        return {
          provider: 'openai',
          model: 'unknown',
          maxContextTokens: 8000,
          pricing: { input: 10.00, output: 30.00 },
        };
      case 'anthropic':
        return {
          provider: 'anthropic',
          model: 'unknown',
          maxContextTokens: 100000,
          pricing: { input: 3.00, output: 15.00 },
        };
      case 'gemini':
        return {
          provider: 'gemini',
          model: 'unknown',
          maxContextTokens: 1000000,
          pricing: { input: 0.10, output: 0.40 },
        };
      default:
        throw new Error(`Unknown provider: ${String(provider)}`);
    }
  }

  /**
   * Get max context tokens for a model
   */
  static getMaxContextTokens(provider: AIProvider, model: string): number {
    return this.getConfig(provider, model).maxContextTokens;
  }

  /**
   * Get pricing for a model
   */
  static getPricing(provider: AIProvider, model: string): { input: number; output: number } {
    return this.getConfig(provider, model).pricing;
  }

  /**
   * Estimate cost for a request
   */
  static estimateCost(
    provider: AIProvider,
    model: string,
    promptTokens: number,
    responseTokens: number
  ): number {
    const pricing = this.getPricing(provider, model);
    return (
      (promptTokens / 1_000_000) * pricing.input +
      (responseTokens / 1_000_000) * pricing.output
    );
  }

  /**
   * Get max output tokens for a task type
   */
  static getTaskMaxTokens(taskType: TaskType): number {
    return TASK_MAX_TOKENS[taskType];
  }

  /**
   * Get all supported models for a provider
   */
  static getModelsForProvider(provider: AIProvider): string[] {
    this.initialize();

    const models: string[] = [];
    for (const config of this.configMap.values()) {
      if (config.provider === provider) {
        models.push(config.model);
      }
    }

    return models;
  }
}
