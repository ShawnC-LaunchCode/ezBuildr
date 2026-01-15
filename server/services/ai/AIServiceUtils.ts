/**
 * AI Service Utilities
 *
 * Token estimation, cost calculation, validation, and error handling utilities
 */

import { createLogger } from '../../logger';

import type { AIErrorCode, TokenEstimate, CostEstimate, TruncationCheck } from './types';
import type { AIGeneratedWorkflow } from '../../../shared/types/ai';

const logger = createLogger({ module: 'ai-service-utils' });

/**
 * Estimate token count from text (rough approximation: 1 token ≈ 4 characters)
 * This is a conservative estimate - actual tokenization may vary by model
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get maximum context window for a given provider/model
 */
export function getMaxContextTokens(provider: string, model: string): number {
  // Conservative limits to ensure we stay well within bounds
  const limits: Record<string, Record<string, number>> = {
    openai: {
      'gpt-4-turbo-preview': 128000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16385,
      'default': 8000, // Safe default
    },
    anthropic: {
      'claude-3-5-sonnet-20241022': 200000,
      'claude-3-opus-20240229': 200000,
      'claude-3-sonnet-20240229': 200000,
      'default': 100000,
    },
    gemini: {
      'gemini-2.0-flash': 1048576, // 1M tokens
      'gemini-1.5-pro': 2097152, // 2M tokens
      'default': 1000000,
    },
  };

  return limits[provider]?.[model] || limits[provider]?.['default'] || 8000;
}

/**
 * Validate that prompt + response won't exceed context window
 */
export function validateTokenLimits(
  prompt: string,
  maxResponseTokens: number,
  provider: string,
  model: string,
): void {
  const promptTokens = estimateTokenCount(prompt);
  const maxContext = getMaxContextTokens(provider, model);
  const totalTokens = promptTokens + maxResponseTokens;

  logger.debug({
    promptTokens,
    maxResponseTokens,
    totalTokens,
    maxContext,
    provider,
    model,
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

    const error: any = new Error(errorMsg);
    error.code = 'VALIDATION_ERROR';
    error.details = {
      promptTokens,
      maxResponseTokens,
      totalTokens,
      maxContext,
      provider,
      model,
    };
    throw error;
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
 * Estimate cost in USD for AI API call
 * Pricing as of January 2025 - subject to change
 */
export function estimateCost(
  provider: string,
  model: string,
  promptTokens: number,
  responseTokens: number,
): number {
  // Pricing per 1M tokens (input / output)
  const pricing: Record<string, Record<string, { input: number; output: number }>> = {
    openai: {
      'gpt-4-turbo-preview': { input: 10.00, output: 30.00 },
      'gpt-4': { input: 30.00, output: 60.00 },
      'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
      'default': { input: 10.00, output: 30.00 },
    },
    anthropic: {
      'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
      'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
      'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
      'default': { input: 3.00, output: 15.00 },
    },
    gemini: {
      'gemini-2.0-flash': { input: 0.10, output: 0.40 }, // Very cheap!
      'gemini-1.5-pro': { input: 1.25, output: 5.00 },
      'default': { input: 0.10, output: 0.40 },
    },
  };

  const modelPricing = pricing[provider]?.[model] || pricing[provider]?.['default'] || { input: 0, output: 0 };

  const inputCost = (promptTokens / 1_000_000) * modelPricing.input;
  const outputCost = (responseTokens / 1_000_000) * modelPricing.output;

  return inputCost + outputCost;
}

/**
 * Detect if JSON response appears truncated
 * Returns true if response looks incomplete
 */
export function isResponseTruncated(response: string): boolean {
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
  // If it parses successfully, it's definitely not truncated
  try {
    JSON.parse(trimmed);
    return false;  // Parsing succeeded = not truncated
  } catch (parseError) {
    // Parsing failed - likely truncated
    logger.warn({
      parseError: parseError instanceof Error ? parseError.message : String(parseError),
      last100: trimmed.substring(Math.max(0, trimmed.length - 100)),
    }, 'JSON parsing failed - response appears truncated');
    return true;
  }
}

/**
 * Get troubleshooting hints for error codes
 */
export function getTroubleshootingHints(code: string): string {
  const hints: Record<string, string> = {
    INVALID_RESPONSE: [
      '🔧 Troubleshooting Steps:',
      '1. The AI model returned malformed JSON. This usually happens when:',
      '   - The model is overloaded or experiencing issues',
      '   - The prompt is too complex or large',
      '2. Try again in a few moments',
      '3. If the issue persists, try simplifying your request',
      '4. Check AI provider status: https://status.openai.com or https://status.anthropic.com',
    ].join('\n'),

    VALIDATION_ERROR: [
      '🔧 Troubleshooting Steps:',
      '1. The AI response structure doesn\'t match our expected format',
      '2. This may indicate:',
      '   - A breaking change in the AI model behavior',
      '   - The model is struggling with the complexity of the request',
      '3. Try simplifying your workflow or request',
      '4. If this persists, please report this issue with the workflow details',
    ].join('\n'),

    RATE_LIMIT: [
      '🔧 Troubleshooting Steps:',
      '1. You\'ve hit the AI provider\'s rate limit',
      '2. Solutions:',
      '   - Wait 60 seconds and try again',
      '   - Check your API key quota at your provider\'s dashboard',
      '   - Consider upgrading your API plan for higher limits',
      '   - If using free tier, you may need to wait until limits reset',
    ].join('\n'),

    TIMEOUT: [
      '🔧 Troubleshooting Steps:',
      '1. The AI request took too long (>10 minutes)',
      '2. This usually happens when:',
      '   - Your workflow is very large or complex',
      '   - The AI provider is experiencing slowdowns',
      '3. Try:',
      '   - Simplifying your request',
      '   - Breaking large workflows into smaller chunks',
      '   - Trying again during off-peak hours',
    ].join('\n'),

    RESPONSE_TRUNCATED: [
      '✨ Auto-Recovery Active:',
      '1. The AI response was too large and got truncated',
      '2. The system automatically detected this and will retry with chunking',
      '3. This may take a bit longer but will handle larger workflows',
      '4. No action needed - the system is recovering automatically',
    ].join('\n'),

    API_ERROR: [
      '🔧 Troubleshooting Steps:',
      '1. Check your API key is valid and has proper permissions',
      '2. Verify your API key environment variable:',
      `   - GEMINI_API_KEY or AI_API_KEY is set correctly`,
      '3. Check your API quota/billing status',
      '4. Test your API key at the provider\'s dashboard',
      '5. If using a proxy, verify network connectivity',
    ].join('\n'),
  };

  return hints[code] || '';
}

/**
 * Create a typed error with troubleshooting hints
 */
export function createAIError(
  message: string,
  code: AIErrorCode,
  details?: any,
): Error {
  const troubleshootingHints = getTroubleshootingHints(code);
  const fullMessage = troubleshootingHints ? `${message}\n\n${troubleshootingHints}` : message;

  const error = new Error(fullMessage) as any;
  error.code = code;
  error.details = details;
  error.troubleshooting = troubleshootingHints;
  return error;
}

/**
 * Extract retry delay from error if available
 */
export function getRetryAfter(error: any): number | null {
  // Check for Google's "Please retry in X s"
  if (typeof error.message === 'string') {
    const match = error.message.match(/retry in ([0-9.]+)s/);
    if (match) { return Math.ceil(parseFloat(match[1]) * 1000); }
  }
  return null;
}

/**
 * Strip markdown code blocks from AI response
 */
export function stripMarkdownCodeBlocks(text: string): string {
  let stripped = text.trim();
  if (stripped.startsWith('```json')) {
    stripped = stripped.replace(/^```json\n/, '').replace(/\n```$/, '');
  } else if (stripped.startsWith('```')) {
    stripped = stripped.replace(/^```\n/, '').replace(/\n```$/, '');
  }
  return stripped;
}

/**
 * Validate workflow structure (unique IDs, etc)
 */
export function validateWorkflowStructure(workflow: AIGeneratedWorkflow): void {
  // Check for unique section IDs
  const sectionIds = workflow.sections.map((s) => s.id);
  const uniqueSectionIds = new Set(sectionIds);
  if (sectionIds.length !== uniqueSectionIds.size) {
    throw createAIError(
      'Duplicate section IDs found in generated workflow',
      'VALIDATION_ERROR',
    );
  }

  // Check for unique step IDs and aliases across all sections
  const stepIds = new Set<string>();
  const stepAliases = new Set<string>();

  for (const section of workflow.sections) {
    for (const step of section.steps) {
      if (stepIds.has(step.id)) {
        throw createAIError(
          `Duplicate step ID: ${step.id}`,
          'VALIDATION_ERROR',
        );
      }
      stepIds.add(step.id);

      if (step.alias) {
        if (stepAliases.has(step.alias)) {
          throw createAIError(
            `Duplicate step alias: ${step.alias}`,
            'VALIDATION_ERROR',
          );
        }
        stepAliases.add(step.alias);
      }
    }
  }

  // Validate logic rules reference existing steps/sections
  for (const rule of workflow.logicRules) {
    if (!stepAliases.has(rule.conditionStepAlias)) {
      throw createAIError(
        `Logic rule references non-existent step alias: ${rule.conditionStepAlias}`,
        'VALIDATION_ERROR',
      );
    }
  }

  // Validate transform blocks reference existing steps
  for (const block of workflow.transformBlocks) {
    for (const inputKey of block.inputKeys) {
      if (!stepAliases.has(inputKey)) {
        throw createAIError(
          `Transform block references non-existent step alias: ${inputKey}`,
          'VALIDATION_ERROR',
        );
      }
    }
  }
}
