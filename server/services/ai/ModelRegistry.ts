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
};

/**
 * Comprehensive model configurations
 */
const MODEL_CONFIGS: ModelConfig[] = [
  // OpenAI Models
  {
    provider: 'openai',
    model: 'gpt-4-turbo-preview',
    maxContextTokens: 128000,
    pricing: { input: 10.00, output: 30.00 },
  },
  {
    provider: 'openai',
    model: 'gpt-4',
    maxContextTokens: 8192,
    pricing: { input: 30.00, output: 60.00 },
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    maxContextTokens: 16385,
    pricing: { input: 0.50, output: 1.50 },
  },

  // Anthropic Models
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    maxContextTokens: 200000,
    pricing: { input: 3.00, output: 15.00 },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    maxContextTokens: 200000,
    pricing: { input: 15.00, output: 75.00 },
  },
  {
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229',
    maxContextTokens: 200000,
    pricing: { input: 3.00, output: 15.00 },
  },

  // Gemini Models
  {
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    maxContextTokens: 1048576, // 1M tokens
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
  private static initialize() {
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
        throw new Error(`Unknown provider: ${provider}`);
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
