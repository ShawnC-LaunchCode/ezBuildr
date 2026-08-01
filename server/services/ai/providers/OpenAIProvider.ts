
import OpenAI from 'openai';

import { createLogger } from '../../../logger';

import { BaseAIProvider } from './BaseAIProvider';

import type { TaskType } from '../types';
import type { AIProviderConfig, AIProviderResponse } from './types';

const logger = createLogger({ module: 'openai-provider' });

export class OpenAIProvider extends BaseAIProvider {
    readonly providerName = 'openai';
    private client: OpenAI;

    constructor(config: AIProviderConfig) {
        super(config);
        this.client = new OpenAI({ apiKey: config.apiKey, timeout: 600000 });
    }

    async generateResponse(
        prompt: string,
        taskType: TaskType,
        systemMessage?: string
    ): Promise<AIProviderResponse> {
        const { model, temperature = 0.7, maxTokens } = this.config;
        const startTime = Date.now();
        const promptTokens = this.estimateTokenCount(prompt); // Rough estimate

        // Validate limits before calling
        // Note: We use a safe default if maxTokens is undefined, logic mirrored from original service
        const safeMaxTokens = maxTokens ?? 4000;
        this.validateTokenLimits(prompt, safeMaxTokens);

        logger.debug({ model, taskType }, 'Calling OpenAI');

        try {
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

            if (systemMessage) {
                messages.push({ role: 'system', content: systemMessage });
            } else {
                // Default system message if none provided
                messages.push({
                    role: 'system',
                    content: 'You are a workflow design expert. You output only valid JSON with no additional text or markdown formatting.'
                });
            }

            messages.push({ role: 'user', content: prompt });

            const response = await this.client.chat.completions.create({
                model,
                messages,
                temperature,

                max_tokens: safeMaxTokens,
                response_format: { type: 'json_object' },

            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw this.createError('No content in OpenAI response', 'INVALID_RESPONSE');
            }

            // Real usage from OpenAI's response; char/4 estimate is only a
            // fallback if the SDK ever omits `usage` (ICW2-B7).
            const usage = response.usage
                ? { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens }
                : undefined;
            const responseTokens = usage?.outputTokens ?? this.estimateTokenCount(content);
            const duration = Date.now() - startTime;
            const actualCost = this.estimateCost(usage?.inputTokens ?? promptTokens, responseTokens);

            logger.info({
                event: 'ai_request_success',
                provider: this.providerName,
                model,
                taskType,
                promptTokens,
                responseTokens,
                durationMs: duration,
                estimatedCostUSD: actualCost,
                usageSource: usage ? 'provider' : 'estimate',
            }, 'OpenAI request succeeded');

            return { text: content, usage };
        } catch (error) {
            logger.error({ error }, 'OpenAI request failed');
            throw error;
        }
    }
}
