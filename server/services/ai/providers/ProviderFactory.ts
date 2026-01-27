/**
 * Provider Factory
 *
 * Creates the appropriate AI provider instance based on configuration
 */

import { AnthropicProvider } from './AnthropicProvider';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';

import type { IAIProvider, AIProviderConfig } from './types';
import type { AIProvider } from '../../../../shared/types/ai';

/**
 * Factory for creating AI provider instances
 */
export class ProviderFactory {
  /**
   * Create a provider instance based on configuration
   */
  static createProvider(config: AIProviderConfig): IAIProvider {
    const provider = config.provider as AIProvider;

    switch (provider) {
      case 'openai':
        return new OpenAIProvider(config);

      case 'anthropic':
        return new AnthropicProvider(config);

      case 'gemini':
        return new GeminiProvider(config);

      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }
  }

  /**
   * Validate provider configuration
   */
  static validateConfig(config: AIProviderConfig): void {
    if (!config.provider) {
      throw new Error('Provider is required');
    }

    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    if (!config.model) {
      throw new Error('Model is required');
    }

    const supportedProviders: AIProvider[] = ['openai', 'anthropic', 'gemini'];
    if (!supportedProviders.includes(config.provider as AIProvider)) {
      throw new Error(
        `Unsupported provider: ${config.provider}. Supported providers: ${supportedProviders.join(', ')}`
      );
    }
  }
}
