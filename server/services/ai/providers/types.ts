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
 * Real (or, when a provider omits it, estimated) token usage for a single
 * `generateResponse` call. ICW2-B7: this is what makes per-tenant budgeting
 * possible — previously usage was estimated (char/4) and discarded.
 */
export interface AIProviderUsage {
    inputTokens: number;
    outputTokens: number;
}

/**
 * Result of a `generateResponse` call: the model's text plus, when the
 * provider's SDK surfaces it, real token usage. `usage` is omitted only when
 * the provider genuinely returns no usage data — callers fall back to a
 * char/4 estimate in that case (ICW2-B7).
 */
export interface AIProviderResponse {
    text: string;
    usage?: AIProviderUsage;
}

/**
 * Interface that all AI providers must implement
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- I-prefix is industry standard for provider interfaces
export interface IAIProvider {
    /**
     * The provider identifier (openai, anthropic, gemini)
     */
    readonly providerName: string;

    /**
     * Generate a response from the LLM
     */
    generateResponse(
        prompt: string,
        taskType: TaskType,
        systemMessage?: string
    ): Promise<AIProviderResponse>;

    /**
     * Estimate token count for a text string
     */
    estimateTokenCount(text: string): number;

    /**
     * Calculate exact or estimated cost for a request
     */
    estimateCost(promptTokens: number, responseTokens: number): number;

    /**
     * Get maximum context window for the current model
     */
    getMaxContextTokens(): number;

    /**
     * Check if response appears to be truncated
     */
    isResponseTruncated(response: string): boolean;
}
