// eslint-disable-next-line @typescript-eslint/naming-convention -- third-party package name
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
                /* eslint-disable @typescript-eslint/naming-convention -- OpenAI API uses snake_case */
                max_tokens: safeMaxTokens,
                response_format: { type: 'json_object' },
                /* eslint-enable @typescript-eslint/naming-convention */
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
}
