/**
 * AI Provider Client
 *
 * Manages connections to OpenAI, Anthropic, and Gemini APIs
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

import { createLogger } from '../../logger';

import {
  estimateTokenCount,
  validateTokenLimits,
  estimateCost,
  createAIError,
  getRetryAfter,
  stripMarkdownCodeBlocks,
} from './AIServiceUtils';

import type { TaskType } from './types';
import type { AIProvider, AIProviderConfig } from '../../../shared/types/ai';

const logger = createLogger({ module: 'ai-provider-client' });

/**
 * AI Provider Client - handles all LLM API calls
 */
export class AIProviderClient {
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private geminiClient: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;

    if (config.provider === 'openai') {
      this.openaiClient = new OpenAI({ apiKey: config.apiKey, timeout: 600000 });
    } else if (config.provider === 'anthropic') {
      this.anthropicClient = new Anthropic({ apiKey: config.apiKey, timeout: 600000 });
    } else if (config.provider === 'gemini') {
      const genAI = new GoogleGenerativeAI(config.apiKey);
      this.geminiClient = genAI.getGenerativeModel({ model: config.model }, { timeout: 600000 });
    } else {
      throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  }

  /**
   * Call the configured LLM provider with retry logic
   */
  async callLLM(prompt: string, taskType: TaskType): Promise<string> {
    const { provider, model, temperature = 0.7 } = this.config;

    // Task-specific max tokens
    const taskMaxTokens: Record<TaskType, number> = {
      workflow_generation: 8000,
      workflow_revision: 8192,  // Increased to Gemini 2.0 Flash's actual max
      workflow_suggestion: 4000,
      binding_suggestion: 4000,
      value_suggestion: 4000,
      logic_generation: 4000,
      logic_debug: 4000,
      logic_visualization: 4000,
    };

    // Use task-specific maxTokens, fall back to config, then fall back to task default
    const maxTokens = (this.config.maxTokens && this.config.maxTokens > taskMaxTokens[taskType])
      ? this.config.maxTokens
      : taskMaxTokens[taskType];

    const startTime = Date.now();
    const promptTokens = estimateTokenCount(prompt);

    // Validate token limits BEFORE making the API call
    validateTokenLimits(prompt, maxTokens, provider, model);

    logger.debug({ provider, model, taskType, timeout: this.geminiClient ? 600000 : 'default' }, 'Calling LLM');

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
    const responseTokens = 0;
    const actualCost = 0;

    while (attempt <= maxRetries) {
      try {
        if (provider === 'openai' && this.openaiClient) {
          return await this.callOpenAI(prompt, maxTokens, temperature, startTime, promptTokens);
        } else if (provider === 'anthropic' && this.anthropicClient) {
          return await this.callAnthropic(prompt, maxTokens, temperature, startTime, promptTokens);
        } else if (provider === 'gemini' && this.geminiClient) {
          return await this.callGemini(prompt, maxTokens, temperature, startTime, promptTokens);
        } else {
          throw createAIError(`Provider ${provider} not initialized`, 'API_ERROR');
        }
      } catch (error: any) {
        // Handle rate limiting specifically
        const isRateLimit = error.status === 429 || error.code === 'rate_limit_exceeded' ||
          (error.message?.includes('429')) ||
          (error.message?.includes('Quota exceeded'));

        if (isRateLimit) {
          const retryAfterMs = getRetryAfter(error);

          // If we have retries left and the wait is reasonable (< 15 seconds)
          if (attempt < maxRetries) {
            const waitMs = retryAfterMs || (Math.pow(2, attempt) * 1000); // Exponential backoff fallback

            if (waitMs <= 60000) {
              logger.warn({ attempt, waitMs }, 'Rate limit hit, retrying...');
              await new Promise(resolve => setTimeout(resolve, waitMs));
              attempt++;
              continue;
            }
          }

          // Otherwise, throw explicit rate limit error
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

          throw createAIError(
            'AI API rate limit exceeded. Please try again later.',
            'RATE_LIMIT',
            {
              originalError: error.message,
              retryAfterSeconds: retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 60
            }
          );
        }

        // Handle timeouts (retryable?)
        if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempt++;
            continue;
          }

          // Telemetry: Track timeout failure
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

          throw createAIError('AI API request timed out', 'TIMEOUT', { originalError: error.message });
        }

        // Generic API error - do not retry
        const isDevelopment = process.env.NODE_ENV === 'development';

        // Telemetry: Track generic API error
        const duration = Date.now() - startTime;
        logger.error({
          event: 'ai_request_failed',
          provider,
          model,
          taskType,
          errorType: 'API_ERROR',
          errorName: error.name,
          errorMessage: error.message,
          durationMs: duration,
          attempts: attempt + 1,
        }, 'AI request failed: API error');

        throw createAIError(
          `AI API error: ${error.message}`,
          'API_ERROR',
          {
            originalError: {
              name: error.name,
              message: error.message || String(error),
              ...(isDevelopment && { stack: error.stack }), // Only include stack in development
              keys: Object.keys(error)
            }
          }
        );
      }
    }

    throw new Error('Unexpected retry loop exit');
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(
    prompt: string,
    maxTokens: number,
    temperature: number,
    startTime: number,
    promptTokens: number,
  ): Promise<string> {
    const response = await this.openaiClient!.chat.completions.create({
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a workflow design expert. You output only valid JSON with no additional text or markdown formatting.',
        },
        { role: 'user', content: prompt },
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw createAIError('No content in OpenAI response', 'INVALID_RESPONSE');
    }

    // Telemetry: Track successful response
    const responseTokens = estimateTokenCount(content);
    const duration = Date.now() - startTime;
    const actualCost = estimateCost(this.config.provider, this.config.model, promptTokens, responseTokens);

    logger.info({
      event: 'ai_request_success',
      provider: this.config.provider,
      model: this.config.model,
      promptTokens,
      responseTokens,
      totalTokens: promptTokens + responseTokens,
      durationMs: duration,
      estimatedCostUSD: actualCost,
    }, 'AI request succeeded');

    return content;
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(
    prompt: string,
    maxTokens: number,
    temperature: number,
    startTime: number,
    promptTokens: number,
  ): Promise<string> {
    const response = await this.anthropicClient!.messages.create({
      model: this.config.model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
      system:
        'You are a workflow design expert. You output only valid JSON with no additional text or markdown formatting. Never wrap your JSON in markdown code blocks.',
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw createAIError('Unexpected Anthropic response type', 'INVALID_RESPONSE');
    }

    // Strip markdown code blocks
    const text = stripMarkdownCodeBlocks(content.text);

    // Telemetry: Track successful response
    const responseTokens = estimateTokenCount(text);
    const duration = Date.now() - startTime;
    const actualCost = estimateCost(this.config.provider, this.config.model, promptTokens, responseTokens);

    logger.info({
      event: 'ai_request_success',
      provider: this.config.provider,
      model: this.config.model,
      promptTokens,
      responseTokens,
      totalTokens: promptTokens + responseTokens,
      durationMs: duration,
      estimatedCostUSD: actualCost,
    }, 'AI request succeeded');

    return text;
  }

  /**
   * Call Gemini API
   */
  private async callGemini(
    prompt: string,
    maxTokens: number,
    temperature: number,
    startTime: number,
    promptTokens: number,
  ): Promise<string> {
    const result = await this.geminiClient!.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    });
    const response = result.response;
    const content = response.text();

    if (!content) {
      throw createAIError('No content in Gemini response', 'INVALID_RESPONSE');
    }

    // Strip markdown code blocks
    const text = stripMarkdownCodeBlocks(content);

    // Telemetry: Track successful response
    const responseTokens = estimateTokenCount(text);
    const duration = Date.now() - startTime;
    const actualCost = estimateCost(this.config.provider, this.config.model, promptTokens, responseTokens);

    logger.info({
      event: 'ai_request_success',
      provider: this.config.provider,
      model: this.config.model,
      promptTokens,
      responseTokens,
      totalTokens: promptTokens + responseTokens,
      durationMs: duration,
      estimatedCostUSD: actualCost,
    }, 'AI request succeeded');

    return text;
  }
}
