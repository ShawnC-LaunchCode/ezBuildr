import { GoogleGenerativeAI } from '@google/generative-ai';

import { createLogger } from '../../../logger';

import { BaseAIProvider } from './BaseAIProvider';

import type { TaskType } from '../types';
import type { AIProviderConfig } from './types';

const logger = createLogger({ module: 'gemini-provider' });

export class GeminiProvider extends BaseAIProvider {
    readonly providerName = 'gemini';
    private client: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

    constructor(config: AIProviderConfig) {
        super(config);
        const genAI = new GoogleGenerativeAI(config.apiKey);
        this.client = genAI.getGenerativeModel({ model: config.model }, { timeout: 600000 });
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

        logger.debug({ model, taskType }, 'Calling Gemini');

        try {
            // Note: Gemini API handles system prompts differently or not at all depending on model version/SDK
            // For now we append it to the prompt if critical, or assume the model follows instructions well.
            // The original implementation had a single prompt part.

            const result = await this.client.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature,
                    maxOutputTokens: safeMaxTokens,
                },
            });

            const response = result.response;
            const content = response.text();

            if (!content) {
                throw this.createError('No content in Gemini response', 'INVALID_RESPONSE');
            }

            // Strip markdown code blocks
            let text = content.trim();
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
            }, 'Gemini request succeeded');

            return text;
        } catch (error) {
            logger.error({ error }, 'Gemini request failed');
            throw error;
        }
    }

    getMaxContextTokens(): number {
        const model = this.config.model;
        const limits: Record<string, number> = {
            'gemini-2.0-flash': 1048576,
            'gemini-1.5-pro': 2097152,
            'default': 1000000,
        };
        return limits[model] || limits['default'];
    }

    estimateCost(promptTokens: number, responseTokens: number): number {
        const model = this.config.model;
        const pricing: Record<string, { input: number; output: number }> = {
            'gemini-2.0-flash': { input: 0.10, output: 0.40 },
            'gemini-1.5-pro': { input: 1.25, output: 5.00 },
            'default': { input: 0.10, output: 0.40 },
        };

        const modelPricing = pricing[model] || pricing['default'];
        return (promptTokens / 1_000_000) * modelPricing.input +
            (responseTokens / 1_000_000) * modelPricing.output;
    }
}
