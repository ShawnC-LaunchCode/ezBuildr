import { createLogger } from '../../../logger';
import { AIError } from '../AIError';
import { ModelRegistry } from '../ModelRegistry';

import type { TaskType } from '../types';
import type { IAIProvider, AIProviderConfig } from './types';

const logger = createLogger({ module: 'ai-provider' });

/**
 * Abstract base class for AI providers
 * Implements common utilities for token counting, validation, and logging
 */
export abstract class BaseAIProvider implements IAIProvider {
    abstract readonly providerName: string;
    protected config: AIProviderConfig;

    constructor(config: AIProviderConfig) {
        this.config = config;
    }

    /**
     * Generate response - must be implemented by subclasses
     */
    abstract generateResponse(
        prompt: string,
        taskType: TaskType,
        systemMessage?: string
    ): Promise<string>;

    /**
     * Estimate token count from text (rough approximation: 1 token ≈ 4 characters)
     * Subclasses can override this if they have more accurate tokenizers
     */
    estimateTokenCount(text: string): number {
        return Math.ceil(text.length / 4);
    }

    /**
     * Get max context tokens using ModelRegistry
     */
    getMaxContextTokens(): number {
        return ModelRegistry.getMaxContextTokens(this.config.provider as any, this.config.model);
    }

    /**
     * Estimate cost using ModelRegistry
     */
    estimateCost(promptTokens: number, responseTokens: number): number {
        return ModelRegistry.estimateCost(
            this.config.provider as any,
            this.config.model,
            promptTokens,
            responseTokens
        );
    }

    /**
     * Validate that prompt + response won't exceed context window
     */
    protected validateTokenLimits(prompt: string, maxResponseTokens: number): void {
        const promptTokens = this.estimateTokenCount(prompt);
        const maxContext = this.getMaxContextTokens();
        const totalTokens = promptTokens + maxResponseTokens;

        logger.debug({
            promptTokens,
            maxResponseTokens,
            totalTokens,
            maxContext,
            provider: this.providerName,
            model: this.config.model,
        }, 'Token usage estimate');

        if (totalTokens > maxContext) {
            const errorMsg = [
                `Request exceeds model's context window:`,
                `  Prompt: ~${promptTokens.toLocaleString()} tokens`,
                `  Expected response: ~${maxResponseTokens.toLocaleString()} tokens`,
                `  Total: ~${totalTokens.toLocaleString()} tokens`,
                `  Model limit: ${maxContext.toLocaleString()} tokens`,
                ``,
                `The workflow or request is too large for the AI model to process.`,
            ].join('\n');

            throw this.createError(errorMsg, 'VALIDATION_ERROR', {
                promptTokens,
                maxResponseTokens,
                totalTokens,
                maxContext,
                provider: this.providerName,
                model: this.config.model,
            });
        }

        // Warn if we're using >80% of context window
        const usagePercent = (totalTokens / maxContext) * 100;
        if (usagePercent > 80) {
            logger.warn({
                promptTokens,
                maxResponseTokens,
                totalTokens,
                maxContext,
                usagePercent: usagePercent.toFixed(1),
            }, 'High token usage - approaching context limit');
        }
    }

    /**
     * Helper to create typed AI errors
     */
    protected createError(message: string, code: string, details?: any): AIError {
        return new AIError(message, code as any, details);
    }

    /**
     * Detect if JSON response appears truncated
     */
    public isResponseTruncated(response: string): boolean {
        const trimmed = response.trim();

        // Check 1: Response should end with closing brace or bracket
        const endsCorrectly = trimmed.endsWith('}') || trimmed.endsWith(']');
        if (!endsCorrectly) {
            logger.warn({
                lastChar: trimmed.charAt(trimmed.length - 1),
                last50: trimmed.substring(trimmed.length - 50),
            }, 'Response does not end with closing brace/bracket');
            return true;
        }

        // Check 2: Count opening vs closing braces
        const openBraces = (trimmed.match(/\{/g) || []).length;
        const closeBraces = (trimmed.match(/\}/g) || []).length;
        const openBrackets = (trimmed.match(/\[/g) || []).length;
        const closeBrackets = (trimmed.match(/\]/g) || []).length;

        if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
            logger.warn({
                openBraces,
                closeBraces,
                openBrackets,
                closeBrackets,
            }, 'Mismatched braces/brackets detected');
            return true;
        }

        // Check 3: Try to parse as JSON
        try {
            JSON.parse(trimmed);
            return false;
        } catch (parseError) {
            logger.warn({
                parseError: parseError instanceof Error ? parseError.message : String(parseError),
                last100: trimmed.substring(Math.max(0, trimmed.length - 100)),
            }, 'JSON parsing failed - response appears truncated');
            return true;
        }
    }
}
