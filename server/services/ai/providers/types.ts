import type { TaskType } from '../types';

/**
 * Common configuration for all AI providers
 */
export interface AIProviderConfig {
    provider: string;
    apiKey: string;
    model: string;
    maxTokens?: number;
    temperature?: number;
}

/**
 * Interface that all AI providers must implement
 */
export interface IAIProvider {
    /**
     * The provider identifier (openai, anthropic, gemini)
     */
    readonly providerName: string;

    /**
     * Calculate exact or estimated cost for a request
     */
    estimateCost(promptTokens: number, responseTokens: number): number;

    /**
     * Estimate token count for a text string
     */
    /**
     * Estimate token count for a text string
     */
    estimateTokenCount(text: string): number;

    /**
     * Check if response appears to be truncated
     */
    isResponseTruncated(response: string): boolean;

    /**
     * Get maximum context window for the current model
     */
    getMaxContextTokens(): number;

    /**
     * Generate a response from the LLM
     */
    generateResponse(
        prompt: string,
        taskType: TaskType,
        systemMessage?: string
    ): Promise<string>;
}
