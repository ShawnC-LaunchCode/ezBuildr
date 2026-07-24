import { GoogleGenerativeAI, type ModelParams } from '@google/generative-ai';

import { createLogger } from '../../../logger';

import { BaseAIProvider } from './BaseAIProvider';

import type { TaskType } from '../types';
import type { AIProviderConfig, AIProviderResponse } from './types';

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
    ): Promise<AIProviderResponse> {
        const { model, temperature = 0.7, maxTokens } = this.config;
        const startTime = Date.now();
        const promptTokens = this.estimateTokenCount(prompt);

        const safeMaxTokens = maxTokens ?? 4000;
        this.validateTokenLimits(prompt, safeMaxTokens);

        logger.debug({ model, taskType }, 'Calling Gemini');

        try {
            const genAI = new GoogleGenerativeAI(this.config.apiKey);
            const clientOptions: ModelParams = { model };
            if (systemMessage) {
                clientOptions.systemInstruction = systemMessage;
            }
            const localClient = genAI.getGenerativeModel(clientOptions, { timeout: 600000 });

            const result = await localClient.generateContent({
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

            // Real usage from Gemini's usageMetadata; char/4 estimate is only a
            // fallback if the SDK ever omits it (ICW2-B7).
            const usageMetadata = response.usageMetadata;
            const usage = usageMetadata
                ? { inputTokens: usageMetadata.promptTokenCount, outputTokens: usageMetadata.candidatesTokenCount }
                : undefined;
            const responseTokens = usage?.outputTokens ?? this.estimateTokenCount(text);
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
            }, 'Gemini request succeeded');

            return { text, usage };
        } catch (error) {
            logger.error({ error }, 'Gemini request failed');
            throw error;
        }
    }
}
