/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
/**
 * AI Provider Client
 *
 * Unified client that delegates to provider-specific implementations
 * Handles retry logic, rate limiting, and telemetry
 */

import { LIMITS } from '@shared/limits';

import { createLogger } from '../../logger';
import { aiUsageRepository, type AiUsageRepository } from '../../repositories/AiUsageRepository';

import { AIError, isRateLimitError, isTimeoutError, getRetryAfter } from './AIError';
import { estimateTokenCount } from './AIServiceUtils';
import { ModelRegistry } from './ModelRegistry';
import { ProviderFactory } from './providers/ProviderFactory';

import type { IAIProvider } from './providers/types';
import type { TaskType } from './types';
import type { AIProviderConfig } from '../../../shared/types/ai';

const logger = createLogger({ module: 'ai-provider-client' });

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * AI Provider Client - handles all LLM API calls with retry logic and telemetry
 */
export class AIProviderClient {
  private provider: IAIProvider | null = null;
  private config: AIProviderConfig;
  private readonly aiUsageRepo: AiUsageRepository;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: AIProviderConfig = {} as any,
    aiUsageRepo: AiUsageRepository = aiUsageRepository,
  ) {
    this.config = config;
    this.aiUsageRepo = aiUsageRepo;

    // Only create provider if we have a valid config
    if (config.provider && config.apiKey) {
      try {
        this.provider = ProviderFactory.createProvider(config);
      } catch (error: unknown) {
        logger.warn({ error: error instanceof Error ? error.message : String(error), config: { provider: config.provider } }, 'Failed to create provider');
      }
    }
  }

  /**
   * Fail-closed budget check for the tenant on `this.config`, keyed on a
   * rolling window (ICW2-B7). No-op — enforcement is skipped entirely — when
   * the config carries no `tenantId`, which is the case for every caller that
   * has not yet been threaded through to a request (existing flows keep
   * working with no budget applied).
   */
  private async enforceBudget(tenantId: string): Promise<void> {
    const since = new Date(Date.now() - LIMITS.AI_TENANT_BUDGET_WINDOW_DAYS * MS_PER_DAY);
    const usedTokens = await this.aiUsageRepo.getTokenUsageSince(tenantId, since);

    if (usedTokens >= LIMITS.AI_TENANT_MONTHLY_TOKEN_BUDGET) {
      logger.warn({
        event: 'ai_budget_exceeded',
        tenantId,
        usedTokens,
        budget: LIMITS.AI_TENANT_MONTHLY_TOKEN_BUDGET,
        windowDays: LIMITS.AI_TENANT_BUDGET_WINDOW_DAYS,
      }, 'AI budget exceeded for tenant');

      throw new AIError(
        'AI budget exceeded for this period. Please try again later or contact support to increase your limit.',
        'BUDGET_EXCEEDED',
        { tenantId, usedTokens, budget: LIMITS.AI_TENANT_MONTHLY_TOKEN_BUDGET },
        false,
      );
    }
  }

  /**
   * Persist one call's real (or estimated-fallback) usage for the tenant.
   * Best-effort: a telemetry write failure must not fail an otherwise
   * successful AI response.
   */
  private async recordUsage(
    tenantId: string,
    taskType: TaskType,
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    const { provider, model } = this.config;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const costUsd = ModelRegistry.estimateCost(provider as any, model, inputTokens, outputTokens);
      await this.aiUsageRepo.recordUsage({
        tenantId,
        provider,
        model,
        taskType,
        inputTokens,
        outputTokens,
        costUsd,
      });
    } catch (error: unknown) {
      logger.error({
        error: error instanceof Error ? error.message : String(error),
        tenantId,
      }, 'Failed to persist AI usage row (non-fatal)');
    }
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  async callLLM(prompt: string, taskType: TaskType, systemMessage?: string): Promise<string> {
    if (!this.provider) {
      throw new AIError('AI provider not initialized', 'API_ERROR', {
        config: { provider: this.config.provider }
      });
    }

    const { provider, model, tenantId } = this.config;
    const startTime = Date.now();
    const promptTokens = estimateTokenCount(prompt);

    // Get task-specific max tokens
    const maxTokens = this.config.maxTokens ?? ModelRegistry.getTaskMaxTokens(taskType);

    if (tenantId) {
      await this.enforceBudget(tenantId);
    }

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
        const result = await this.provider.generateResponse(prompt, taskType, systemMessage);
        const text = result.text;

        // Real usage when the provider returned it; char/4 estimate only as a
        // fallback (ICW2-B7).
        const usage = result.usage ?? {
          inputTokens: promptTokens,
          outputTokens: estimateTokenCount(text),
        };

        // Telemetry: Track success
        const duration = Date.now() - startTime;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cost = ModelRegistry.estimateCost(provider as any, model, usage.inputTokens, usage.outputTokens);

        logger.info({
          event: 'ai_request_success',
          provider,
          model,
          taskType,
          promptTokens: usage.inputTokens,
          responseTokens: usage.outputTokens,
          totalTokens: usage.inputTokens + usage.outputTokens,
          durationMs: duration,
          estimatedCostUSD: cost,
          usageSource: result.usage ? 'provider' : 'estimate',
        }, 'AI request succeeded');

        if (tenantId) {
          await this.recordUsage(tenantId, taskType, usage.inputTokens, usage.outputTokens);
        }

        return text;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);

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
            { originalError: message, retryAfterSeconds: retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 60 },
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

          throw new AIError('AI API request timed out', 'TIMEOUT', { originalError: message }, true);
        }

        // Generic API error - no retry
        const duration = Date.now() - startTime;
        logger.error({
          event: 'ai_request_failed',
          provider,
          model,
          taskType,
          errorType: 'API_ERROR',
          errorMessage: message,
          durationMs: duration,
          attempts: attempt + 1,
        }, 'AI request failed: API error');

        throw AIError.fromUnknown(error, 'API_ERROR');
      }
    }

    throw new Error('Unexpected retry loop exit');
  }

}
