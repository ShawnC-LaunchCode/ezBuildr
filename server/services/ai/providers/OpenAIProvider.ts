import OpenAI from 'openai';

import { createLogger } from '../../../logger';

import { BaseAIProvider } from './BaseAIProvider';

import type { TaskType } from '../types';
import type { AIProviderConfig } from './types';

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
    ): Promise<string> {
        const { model, temperature = 0.7, maxTokens } = this.config;
        const startTime = Date.now();
        const promptTokens = this.estimateTokenCount(prompt); // Rough estimate

        // Validate limits before calling
        // Note: We use a safe default if maxTokens is undefined, logic mirrored from original service
        const safeMaxTokens = maxTokens || 4000;
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

            const responseTokens = this.estimateTokenCount(content);
            const duration = Date.now() - startTime;
            const actualCost = this.estimateCost(promptTokens, responseTokens);

            logger.info({
                event: 'ai_request_success',
                provider: this.providerName,
                model,
                taskType,
                promptTokens,
                responseTokens,
                durationMs: duration,
                estimatedCostUSD: actualCost,
            }, 'OpenAI request succeeded');

            return content;
        } catch (error) {
            logger.error({ error }, 'OpenAI request failed');
            throw error;
        }
    }

    getMaxContextTokens(): number {
        const model = this.config.model;
        const limits: Record<string, number> = {
            'gpt-4-turbo-preview': 128000,
            'gpt-4': 8192,
            'gpt-3.5-turbo': 16385,
            'default': 8000,
        };
        return limits[model] || limits['default'];
    }

    estimateCost(promptTokens: number, responseTokens: number): number {
        const model = this.config.model;
        const pricing: Record<string, { input: number; output: number }> = {
            'gpt-4-turbo-preview': { input: 10.00, output: 30.00 },
            'gpt-4': { input: 30.00, output: 60.00 },
            'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
            'default': { input: 10.00, output: 30.00 },
        };

        const modelPricing = pricing[model] || pricing['default'];
        return (promptTokens / 1_000_000) * modelPricing.input +
            (responseTokens / 1_000_000) * modelPricing.output;
    }
}
