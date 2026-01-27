/**
 * AI Provider Client
 *
 * Unified client that delegates to provider-specific implementations
 * Handles retry logic, rate limiting, and telemetry
 */

import { createLogger } from '../../logger';

import { AIError, isRateLimitError, isTimeoutError, getRetryAfter } from './AIError';
import { estimateTokenCount } from './AIServiceUtils';
import { ModelRegistry } from './ModelRegistry';
import { ProviderFactory } from './providers/ProviderFactory';

import type { IAIProvider } from './providers/types';
import type { TaskType } from './types';
import type { AIProvider, AIProviderConfig } from '../../../shared/types/ai';

const logger = createLogger({ module: 'ai-provider-client' });

/**
 * AI Provider Client - handles all LLM API calls with retry logic and telemetry
 */
export class AIProviderClient {
  private provider: IAIProvider | null = null;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig = {} as any) {
    this.config = config;

    // Only create provider if we have a valid config
    if (config.provider && config.apiKey) {
      try {
        this.provider = ProviderFactory.createProvider(config);
      } catch (error: any) {
        logger.warn({ error: error.message, config: { provider: config.provider } }, 'Failed to create provider');
      }
    }
  }

  async callLLM(prompt: string, taskType: TaskType, systemMessage?: string): Promise<string> {
    if (!this.provider) {
      throw new AIError('AI provider not initialized', 'API_ERROR', {
        config: { provider: this.config.provider }
      });
    }

    const { provider, model } = this.config;
    const startTime = Date.now();
    const promptTokens = estimateTokenCount(prompt);

    // Get task-specific max tokens
    const maxTokens = this.config.maxTokens || ModelRegistry.getTaskMaxTokens(taskType);

    // Telemetry: Track AI request
    logger.info({
      event: 'ai_request_started',
      provider,
      model,
      taskType,
      promptTokens,
      maxTokens,
    }, 'AI request started');

    const maxRetries = 6;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        // Delegate to provider
        const response = await this.provider.generateResponse(prompt, taskType, systemMessage);

        // Telemetry: Track success
        const responseTokens = estimateTokenCount(response);
        const duration = Date.now() - startTime;
        const cost = ModelRegistry.estimateCost(provider as any, model, promptTokens, responseTokens);

        logger.info({
          event: 'ai_request_success',
          provider,
          model,
          taskType,
          promptTokens,
          responseTokens,
          totalTokens: promptTokens + responseTokens,
          durationMs: duration,
          estimatedCostUSD: cost,
        }, 'AI request succeeded');

        return response;
      } catch (error: any) {
        // Handle rate limiting with retry
        if (isRateLimitError(error)) {
          const retryAfterMs = getRetryAfter(error);

          if (attempt < maxRetries) {
            const waitMs = retryAfterMs || (Math.pow(2, attempt) * 1000); // Exponential backoff

            if (waitMs <= 60000) { // Max 60 second wait
              logger.warn({ attempt, waitMs }, 'Rate limit hit, retrying...');
              await new Promise(resolve => setTimeout(resolve, waitMs));
              attempt++;
              continue;
            }
          }

          // Otherwise, throw rate limit error
          const duration = Date.now() - startTime;
          logger.error({
            event: 'ai_request_failed',
            provider,
            model,
            taskType,
            errorType: 'RATE_LIMIT',
            durationMs: duration,
            attempts: attempt + 1,
          }, 'AI request failed: rate limit');

          throw new AIError(
            'AI API rate limit exceeded. Please try again later.',
            'RATE_LIMIT',
            { originalError: error.message, retryAfterSeconds: retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 60 },
            true,
            retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 60
          );
        }

        // Handle timeouts with retry
        if (isTimeoutError(error)) {
          if (attempt < maxRetries) {
            logger.warn({ attempt }, 'Timeout, retrying...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempt++;
            continue;
          }

          const duration = Date.now() - startTime;
          logger.error({
            event: 'ai_request_failed',
            provider,
            model,
            taskType,
            errorType: 'TIMEOUT',
            durationMs: duration,
            attempts: attempt + 1,
          }, 'AI request failed: timeout');

          throw new AIError('AI API request timed out', 'TIMEOUT', { originalError: error.message }, true);
        }

        // Generic API error - no retry
        const duration = Date.now() - startTime;
        logger.error({
          event: 'ai_request_failed',
          provider,
          model,
          taskType,
          errorType: 'API_ERROR',
          errorMessage: error.message,
          durationMs: duration,
          attempts: attempt + 1,
        }, 'AI request failed: API error');

        throw AIError.fromUnknown(error, 'API_ERROR');
      }
    }

    throw new Error('Unexpected retry loop exit');
  }

}
