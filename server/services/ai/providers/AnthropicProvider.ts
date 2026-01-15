import Anthropic from '@anthropic-ai/sdk';

import { createLogger } from '../../../logger';

import { BaseAIProvider } from './BaseAIProvider';

import type { TaskType } from '../types';
import type { AIProviderConfig } from './types';

const logger = createLogger({ module: 'anthropic-provider' });

export class AnthropicProvider extends BaseAIProvider {
    readonly providerName = 'anthropic';
    private client: Anthropic;

    constructor(config: AIProviderConfig) {
        super(config);
        this.client = new Anthropic({ apiKey: config.apiKey, timeout: 600000 });
    }

    async generateResponse(
        prompt: string,
        taskType: TaskType,
        systemMessage?: string
    ): Promise<string> {
        const { model, temperature = 0.7, maxTokens } = this.config;
        const startTime = Date.now();
        const promptTokens = this.estimateTokenCount(prompt);

        const safeMaxTokens = maxTokens || 4000;
        this.validateTokenLimits(prompt, safeMaxTokens);

        logger.debug({ model, taskType }, 'Calling Anthropic');

        try {
            const response = await this.client.messages.create({
                model,
                max_tokens: safeMaxTokens,
                temperature,
                messages: [{ role: 'user', content: prompt }],
                system: systemMessage || 'You are a workflow design expert. You output only valid JSON with no additional text or markdown formatting. Never wrap your JSON in markdown code blocks.',
            });

            const content = response.content[0];
            if (content.type !== 'text') {
                throw this.createError('Unexpected Anthropic response type', 'INVALID_RESPONSE');
            }

            // Strip markdown code blocks
            let text = content.text.trim();
            if (text.startsWith('```json')) {
                text = text.replace(/^```json\n/, '').replace(/\n```$/, '');
            } else if (text.startsWith('```')) {
                text = text.replace(/^```\n/, '').replace(/\n```$/, '');
            }

            const responseTokens = this.estimateTokenCount(text);
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
            }, 'Anthropic request succeeded');

            return text;
        } catch (error) {
            logger.error({ error }, 'Anthropic request failed');
            throw error;
        }
    }

    getMaxContextTokens(): number {
        const model = this.config.model;
        const limits: Record<string, number> = {
            'claude-3-5-sonnet-20241022': 200000,
            'claude-3-opus-20240229': 200000,
            'claude-3-sonnet-20240229': 200000,
            'default': 100000,
        };
        return limits[model] || limits['default'];
    }

    estimateCost(promptTokens: number, responseTokens: number): number {
        const model = this.config.model;
        const pricing: Record<string, { input: number; output: number }> = {
            'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
            'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
            'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
            'default': { input: 3.00, output: 15.00 },
        };

        const modelPricing = pricing[model] || pricing['default'];
        return (promptTokens / 1_000_000) * modelPricing.input +
            (responseTokens / 1_000_000) * modelPricing.output;
    }
}
