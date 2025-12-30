/**
 * AI Service for Workflow Generation
 *
 * This service integrates with OpenAI and Anthropic APIs to generate workflow
 * specifications from natural language descriptions.
 *
 * Features:
 * - Generate new workflows from text descriptions
 * - Suggest improvements to existing workflows
 * - Suggest template variable bindings
 * - Robust error handling and validation
 * - Rate limiting protection
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AIProvider,
  AIProviderConfig,
  AIGeneratedWorkflow,
  AIWorkflowGenerationRequest,
  AIWorkflowSuggestion,
  AIWorkflowSuggestionRequest,
  AITemplateBindingsResponse,
  AITemplateBindingsRequest,
  AIServiceError,
  AIWorkflowRevisionRequest,
  AIWorkflowRevisionResponse,
} from '../../shared/types/ai';
import {
  AIGeneratedWorkflowSchema,
  AIWorkflowSuggestionSchema,
  AITemplateBindingsResponseSchema,
  AIWorkflowRevisionResponseSchema,
  AIConnectLogicRequest,
  AIConnectLogicResponse,
  AIConnectLogicResponseSchema,
  AIDebugLogicRequest,
  AIDebugLogicResponse,
  AIDebugLogicResponseSchema,
  AIVisualizeLogicRequest,
  AIVisualizeLogicResponse,
  AIVisualizeLogicResponseSchema,
} from '../../shared/types/ai';
import { createLogger } from '../logger';
import { workflowQualityValidator } from './WorkflowQualityValidator';

const logger = createLogger({ module: 'ai-service' });

/**
 * AI Service for workflow generation and suggestions
 */
export class AIService {
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private geminiClient: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;

    if (config.provider === 'openai') {
      this.openaiClient = new OpenAI({ apiKey: config.apiKey, timeout: 600000 });
    } else if (config.provider === 'anthropic') {
      this.anthropicClient = new Anthropic({ apiKey: config.apiKey, timeout: 600000 });
    } else if (config.provider === 'gemini') {
      const genAI = new GoogleGenerativeAI(config.apiKey);
      this.geminiClient = genAI.getGenerativeModel({ model: config.model }, { timeout: 600000 });
    } else {
      throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  }

  /**
   * Generate a new workflow from a natural language description
   */
  async generateWorkflow(
    request: AIWorkflowGenerationRequest,
  ): Promise<AIGeneratedWorkflow> {
    const startTime = Date.now();

    try {
      const prompt = this.buildWorkflowGenerationPrompt(request);
      const response = await this.callLLM(prompt, 'workflow_generation');

      // Parse and validate the response
      const parsed = JSON.parse(response);
      const validated = AIGeneratedWorkflowSchema.parse(parsed);

      // Validate and Normalize workflow structure
      this.normalizeWorkflowTypes(validated);
      this.validateWorkflowStructure(validated);

      // Quality validation
      const qualityScore = workflowQualityValidator.validate(validated);

      const duration = Date.now() - startTime;
      logger.info({
        duration,
        sectionsCount: validated.sections.length,
        rulesCount: validated.logicRules.length,
        blocksCount: validated.transformBlocks.length,
        qualityScore: qualityScore.overall,
        qualityBreakdown: qualityScore.breakdown,
        qualityPassed: qualityScore.passed,
        issuesCount: qualityScore.issues.length,
      }, 'AI workflow generation succeeded');

      // Attach quality metadata to response (will be used by routes)
      (validated as any).__qualityScore = qualityScore;

      return validated;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ error, duration }, 'AI workflow generation failed');

      if (error instanceof SyntaxError) {
        throw this.createError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw this.createError(
          'AI response does not match expected schema',
          'VALIDATION_ERROR',
          { originalError: error },
        );
      }

      throw error;
    }
  }

  /**
   * Suggest improvements to an existing workflow
   */
  async suggestWorkflowImprovements(
    request: AIWorkflowSuggestionRequest,
    existingWorkflow: {
      sections: any[];
      logicRules?: any[];
      transformBlocks?: any[];
    },
  ): Promise<AIWorkflowSuggestion> {
    const startTime = Date.now();

    try {
      const prompt = this.buildWorkflowSuggestionPrompt(request, existingWorkflow);
      const response = await this.callLLM(prompt, 'workflow_suggestion');

      const parsed = JSON.parse(response);
      const validated = AIWorkflowSuggestionSchema.parse(parsed);

      const duration = Date.now() - startTime;
      logger.info({
        duration,
        newSectionsCount: validated.newSections.length,
        newRulesCount: validated.newLogicRules.length,
        newBlocksCount: validated.newTransformBlocks.length,
        modificationsCount: validated.modifications.length,
      }, 'AI workflow suggestion succeeded');

      return validated;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ error, duration }, 'AI workflow suggestion failed');

      if (error instanceof SyntaxError) {
        throw this.createError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw this.createError(
          'AI response does not match expected schema',
          'VALIDATION_ERROR',
          { originalError: error },
        );
      }

      throw error;
    }
  }

  /**
   * Suggest template variable bindings
   */
  async suggestTemplateBindings(
    request: AITemplateBindingsRequest,
    variables: Array<{ alias: string; label: string; type: string }>,
    placeholders: string[],
  ): Promise<AITemplateBindingsResponse> {
    const startTime = Date.now();

    try {
      const prompt = this.buildBindingSuggestionPrompt(variables, placeholders);
      const response = await this.callLLM(prompt, 'binding_suggestion');

      const parsed = JSON.parse(response);
      const validated = AITemplateBindingsResponseSchema.parse(parsed);

      const duration = Date.now() - startTime;
      logger.info({
        duration,
        suggestionsCount: validated.suggestions.length,
      }, 'AI binding suggestion succeeded');

      return validated;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ error, duration }, 'AI binding suggestion failed');

      if (error instanceof SyntaxError) {
        throw this.createError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw this.createError(
          'AI response does not match expected schema',
          'VALIDATION_ERROR',
          { originalError: error },
        );
      }

      throw error;
    }
  }

  /**
   * Build the prompt for workflow generation
   */
  private buildWorkflowGenerationPrompt(
    request: AIWorkflowGenerationRequest,
  ): string {
    const constraints = request.constraints || {};
    const maxSections = constraints.maxSections || 10;
    const maxStepsPerSection = constraints.maxStepsPerSection || 10;

    return `You are an expert workflow designer for VaultLogic, a professional document automation and workflow platform.
Your task is to design a HIGH-QUALITY, PRODUCTION-READY workflow based on the user's description.

User Description:
${request.description}

${request.placeholders ? `Template Placeholders Available:\n${request.placeholders.join(', ')}\n` : ''}

QUALITY REQUIREMENTS:
1. **Logical Flow**: Questions should follow a natural, intuitive order
2. **Clear Language**: Use professional, unambiguous language
3. **Appropriate Granularity**: Break complex inputs into manageable steps
4. **User Experience**: Minimize cognitive load, group related questions
5. **Data Quality**: Use appropriate validation and input types
6. **Completeness**: Capture ALL necessary information for the use case

Output a JSON object with this exact structure:
{
  "title": "Workflow Title",
  "description": "Brief description",
  "sections": [
    {
      "id": "unique_section_id",
      "title": "Section Title",
      "description": "Optional description",
      "order": 0,
      "steps": [
        {
          "id": "unique_step_id",
          "type": "short_text|long_text|multiple_choice|radio|checkbox|yes_no|date_time|file_upload",
          "title": "Question or field title",
          "description": "Optional description",
          "alias": "camelCaseVariableName",
          "required": true|false,
          "config": {}
        }
      ]
    }
  ],
  "logicRules": [
    {
      "id": "unique_rule_id",
      "conditionStepAlias": "stepVariableName",
      "operator": "equals|not_equals|contains|greater_than|less_than|is_empty|is_not_empty",
      "conditionValue": "value to compare",
      "targetType": "section|step",
      "targetAlias": "targetVariableName",
      "action": "show|hide|require|make_optional|skip_to",
      "description": "What this rule does"
    }
  ],
  "transformBlocks": [
    {
      "id": "unique_block_id",
      "name": "Block Name",
      "language": "javascript|python",
      "code": "code to execute",
      "inputKeys": ["alias1", "alias2"],
      "outputKey": "outputAlias",
      "phase": "onSectionSubmit|onWorkflowComplete",
      "timeoutMs": 1000
    }
  ],
  "notes": "Optional notes about design decisions"
}

CRITICAL CONSTRAINTS:
- Maximum ${maxSections} sections
- Maximum ${maxStepsPerSection} steps per section
- All step aliases MUST be unique across the workflow and use camelCase (e.g., "firstName", "emailAddress")
- ALWAYS generate a descriptive, meaningful alias for EVERY step - NEVER leave empty
- All IDs must be unique and use lowercase_with_underscores format
- Step titles must be clear questions or instructions (e.g., "What is your full name?" not "Name")
- For multiple_choice, radio types, ALWAYS include config.options as array of strings (minimum 2 options)
- Transform block code MUST call emit(value) exactly once
- NO network calls or file system access in transform blocks

STEP TYPE SELECTION GUIDE:
- **short_text**: Names, titles, single-line answers (< 100 chars)
- **long_text**: Descriptions, explanations, comments (> 100 chars)
- **email**: Email addresses (use this instead of short_text for emails)
- **phone**: Phone numbers with formatting
- **number**: Numeric values, quantities, counts
- **currency**: Money amounts (auto-formats with $ symbol)
- **date**: Date selection without time
- **date_time**: Date with time selection
- **radio**: Single selection from 2-7 options (mutually exclusive)
- **multiple_choice**: Multi-select from 2-10 options (checkboxes)
- **yes_no**: Simple binary choice
- **scale**: Rating or scale (1-5, 1-10, etc.)
- **address**: Full mailing address
- **website**: URLs with validation
- **file_upload**: Document or image uploads
- **display**: Information-only, no input required

BEST PRACTICES:
1. Group related questions into logical sections (e.g., "Personal Information", "Contact Details")
2. Start with basic identifying information before complex questions
3. Use appropriate field types for better validation (email vs short_text, phone vs short_text)
4. Provide clear, actionable descriptions for complex questions
5. Use logic rules to show/hide conditional questions based on previous answers
6. Keep sections focused - don't mix unrelated topics
7. Use transform blocks for calculated fields (full name from first+last, total from sum, etc.)

LOGIC RULES GUIDANCE:
- Use show/hide for optional sections based on answers
- Use require/make_optional for conditional required fields
- Use skip_to for branching workflows
- Keep conditions simple: prefer equals/not_equals over complex operators

TRANSFORM BLOCK PATTERNS:
- Concatenation: \`emit(input.firstName + ' ' + input.lastName);\`
- Calculations: \`emit(input.quantity * input.price);\`
- Formatting: \`emit(input.rawValue.toUpperCase());\`
- Date math: Use helpers.date methods for date calculations

Output ONLY valid JSON, NO markdown code blocks, NO additional text.`;
  }

  /**
   * Build the prompt for workflow suggestions
   */
  private buildWorkflowSuggestionPrompt(
    request: AIWorkflowSuggestionRequest,
    existingWorkflow: any,
  ): string {
    return `You are a workflow improvement assistant for VaultLogic.
You are reviewing an existing workflow and suggesting improvements based on user request.

User Request:
${request.description}

Existing Workflow:
${JSON.stringify(existingWorkflow, null, 2)}

Output a JSON object with this exact structure:
{
  "newSections": [ /* array of new sections to add, same schema as workflow generation */ ],
  "newLogicRules": [ /* array of new logic rules, same schema as workflow generation */ ],
  "newTransformBlocks": [ /* array of new transform blocks, same schema as workflow generation */ ],
  "modifications": [
    {
      "type": "section|step|logic_rule|transform_block",
      "id": "existing_item_id",
      "changes": { "field": "newValue" },
      "reason": "Why this change is suggested"
    }
  ],
  "notes": "Additional context about the suggestions"
}

Guidelines:
- Suggest additions and modifications separately
- Only suggest changes that align with the user's request
- Reuse existing step aliases when referencing them in new logic rules
- Maintain consistency with existing workflow structure
- Keep suggestions practical and implementable
- For new elements, follow the same schema and constraints as workflow generation

Output ONLY the JSON object, no additional text or markdown.`;
  }

  /**
   * Build the prompt for binding suggestions
   */
  private buildBindingSuggestionPrompt(
    variables: Array<{ alias: string; label: string; type: string }>,
    placeholders: string[],
  ): string {
    return `You are a template binding assistant for VaultLogic.
Your task is to match DOCX template placeholders to workflow variables.

Available Workflow Variables:
${variables.map((v) => `- ${v.alias} (${v.type}): ${v.label}`).join('\n')}

Template Placeholders to Match:
${placeholders.map((p) => `- {{${p}}}`).join('\n')}

Output a JSON object with this exact structure:
{
  "suggestions": [
    {
      "placeholder": "placeholder_name",
      "variable": "workflowVariableAlias",
      "confidence": 0.95,
      "rationale": "Why this binding makes sense"
    }
  ],
  "unmatchedPlaceholders": ["placeholder1", "placeholder2"],
  "unmatchedVariables": ["variable1", "variable2"]
}

Guidelines:
- Match placeholders to variables based on semantic similarity
- Confidence should be 0-1, where 1.0 is perfect match
- Only suggest matches with confidence >= 0.5
- Consider both the variable alias and label when matching
- Placeholders and variables that don't have a good match go in unmatched arrays
- Provide clear rationale for each suggestion

Output ONLY the JSON object, no additional text or markdown.`;
  }

  /**
   * Estimate token count from text (rough approximation: 1 token ≈ 4 characters)
   * This is a conservative estimate - actual tokenization may vary by model
   */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Detect if JSON response appears truncated
   * Returns true if response looks incomplete
   */
  private isResponseTruncated(response: string): boolean {
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
   * Get maximum context window for the current provider/model
   */
  private getMaxContextTokens(): number {
    const { provider, model } = this.config;

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
  private validateTokenLimits(prompt: string, maxResponseTokens: number): void {
    const promptTokens = this.estimateTokenCount(prompt);
    const maxContext = this.getMaxContextTokens();
    const totalTokens = promptTokens + maxResponseTokens;

    logger.debug({
      promptTokens,
      maxResponseTokens,
      totalTokens,
      maxContext,
      provider: this.config.provider,
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
        provider: this.config.provider,
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
   * Estimate cost in USD for AI API call
   * Pricing as of January 2025 - subject to change
   */
  private estimateCost(provider: string, model: string, promptTokens: number, responseTokens: number): number {
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
   * Call the configured LLM provider with retry logic
   */
  private async callLLM(
    prompt: string,
    taskType: 'workflow_generation' | 'workflow_suggestion' | 'binding_suggestion' | 'value_suggestion' | 'workflow_revision' | 'logic_generation' | 'logic_debug' | 'logic_visualization',
  ): Promise<string> {
    const { provider, model, temperature = 0.7 } = this.config;

    // Task-specific max tokens (workflow revisions need more output space)
    // Note: Gemini 2.0 Flash has a max output of 8,192 tokens
    // For large workflows, we use chunking to avoid hitting this limit
    const taskMaxTokens = {
      workflow_generation: 8000,
      workflow_revision: 8192,  // Increased to Gemini 2.0 Flash's actual max
      workflow_suggestion: 4000,
      binding_suggestion: 4000,
      value_suggestion: 4000,
      logic_generation: 4000,
      logic_debug: 4000,
      logic_visualization: 4000,
    };

    // Use task-specific maxTokens, fall back to config, then fall back to task default
    // If config.maxTokens is set and greater than task default, use it
    // Otherwise, use task-specific default
    const maxTokens = (this.config.maxTokens && this.config.maxTokens > taskMaxTokens[taskType])
      ? this.config.maxTokens
      : taskMaxTokens[taskType];

    const startTime = Date.now();
    const promptTokens = this.estimateTokenCount(prompt);

    // Validate token limits BEFORE making the API call
    this.validateTokenLimits(prompt, maxTokens);

    logger.debug({ provider, model, taskType, timeout: this.geminiClient ? 600000 : 'default' }, 'Calling LLM');

    // Telemetry: Track AI request
    logger.info({
      event: 'ai_request_started',
      provider,
      model,
      taskType,
      promptTokens,
      maxTokens,
    }, 'AI request started');

    const maxRetries = 6;
    let attempt = 0;
    let responseTokens = 0;
    let actualCost = 0;

    // Helper to extract retry delay from error if available
    const getRetryAfter = (error: any): number | null => {
      // Check for Google's "Please retry in X s"
      if (typeof error.message === 'string') {
        const match = error.message.match(/retry in ([0-9.]+)s/);
        if (match) return Math.ceil(parseFloat(match[1]) * 1000);
      }
      return null;
    };

    while (attempt <= maxRetries) {
      try {
        if (provider === 'openai' && this.openaiClient) {
          const response = await this.openaiClient.chat.completions.create({
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You are a workflow design expert. You output only valid JSON with no additional text or markdown formatting.',
              },
              { role: 'user', content: prompt },
            ],
            temperature,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' },
          });

          const content = response.choices[0]?.message?.content;
          if (!content) {
            throw this.createError('No content in OpenAI response', 'INVALID_RESPONSE');
          }

          // Telemetry: Track successful response
          responseTokens = this.estimateTokenCount(content);
          const duration = Date.now() - startTime;
          actualCost = this.estimateCost(provider, model, promptTokens, responseTokens);

          logger.info({
            event: 'ai_request_success',
            provider,
            model,
            taskType,
            promptTokens,
            responseTokens,
            totalTokens: promptTokens + responseTokens,
            durationMs: duration,
            estimatedCostUSD: actualCost,
            attempts: attempt + 1,
          }, 'AI request succeeded');

          return content;
        } else if (provider === 'anthropic' && this.anthropicClient) {
          const response = await this.anthropicClient.messages.create({
            model,
            max_tokens: maxTokens,
            temperature,
            messages: [{ role: 'user', content: prompt }],
            system:
              'You are a workflow design expert. You output only valid JSON with no additional text or markdown formatting. Never wrap your JSON in markdown code blocks.',
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

          // Telemetry: Track successful response
          responseTokens = this.estimateTokenCount(text);
          const duration = Date.now() - startTime;
          actualCost = this.estimateCost(provider, model, promptTokens, responseTokens);

          logger.info({
            event: 'ai_request_success',
            provider,
            model,
            taskType,
            promptTokens,
            responseTokens,
            totalTokens: promptTokens + responseTokens,
            durationMs: duration,
            estimatedCostUSD: actualCost,
            attempts: attempt + 1,
          }, 'AI request succeeded');

          return text;
        } else if (provider === 'gemini' && this.geminiClient) {
          // Gemini API call with proper configuration
          const result = await this.geminiClient.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              // Note: responseMimeType requires Gemini 1.5 Pro or later
              // If using older models, remove this line
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

          // Telemetry: Track successful response
          responseTokens = this.estimateTokenCount(text);
          const duration = Date.now() - startTime;
          actualCost = this.estimateCost(provider, model, promptTokens, responseTokens);

          logger.info({
            event: 'ai_request_success',
            provider,
            model,
            taskType,
            promptTokens,
            responseTokens,
            totalTokens: promptTokens + responseTokens,
            durationMs: duration,
            estimatedCostUSD: actualCost,
            attempts: attempt + 1,
          }, 'AI request succeeded');

          return text;
        } else {
          throw this.createError(`Provider ${provider} not initialized`, 'API_ERROR');
        }
      } catch (error: any) {
        // Handle rate limiting specifically
        const isRateLimit = error.status === 429 || error.code === 'rate_limit_exceeded' ||
          (error.message && error.message.includes('429')) ||
          (error.message && error.message.includes('Quota exceeded'));

        if (isRateLimit) {
          const retryAfterMs = getRetryAfter(error);

          // If we have retries left and the wait is reasonable (< 15 seconds)
          if (attempt < maxRetries) {
            const waitMs = retryAfterMs || (Math.pow(2, attempt) * 1000); // Exponential backoff fallback

            if (waitMs <= 60000) {
              logger.warn({ attempt, waitMs }, 'Rate limit hit, retrying...');
              await new Promise(resolve => setTimeout(resolve, waitMs));
              attempt++;
              continue;
            }
          }

          // Otherwise, throw explicit rate limit error
          // Telemetry: Track failure
          const duration = Date.now() - startTime;
          logger.error({
            event: 'ai_request_failed',
            provider,
            model,
            taskType,
            errorType: 'RATE_LIMIT',
            durationMs: duration,
            attempts: attempt + 1,
          }, 'AI request failed: rate limit');

          throw this.createError(
            'AI API rate limit exceeded. Please try again later.',
            'RATE_LIMIT',
            {
              originalError: error.message,
              retryAfterSeconds: retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 60
            }
          );
        }

        // Handle timeouts (retryable?)
        if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempt++;
            continue;
          }

          // Telemetry: Track timeout failure
          const duration = Date.now() - startTime;
          logger.error({
            event: 'ai_request_failed',
            provider,
            model,
            taskType,
            errorType: 'TIMEOUT',
            durationMs: duration,
            attempts: attempt + 1,
          }, 'AI request failed: timeout');

          throw this.createError('AI API request timed out', 'TIMEOUT', { originalError: error.message });
        }

        // Generic API error - do not retry
        const isDevelopment = process.env.NODE_ENV === 'development';

        // Telemetry: Track generic API error
        const duration = Date.now() - startTime;
        logger.error({
          event: 'ai_request_failed',
          provider,
          model,
          taskType,
          errorType: 'API_ERROR',
          errorName: error.name,
          errorMessage: error.message,
          durationMs: duration,
          attempts: attempt + 1,
        }, 'AI request failed: API error');

        throw this.createError(
          `AI API error: ${error.message}`,
          'API_ERROR',
          {
            originalError: {
              name: error.name,
              message: error.message || String(error),
              ...(isDevelopment && { stack: error.stack }), // Only include stack in development
              keys: Object.keys(error)
            }
          }
        );
      }
    }

    throw new Error('Unexpected retry loop exit');
  }

  /**
   * Valid step types from database schema (shared/schema.ts stepTypeEnum)
   * This is the source of truth - must match the actual DB enum
   */
  private readonly VALID_STEP_TYPES = [
    // Legacy types
    'short_text', 'long_text', 'multiple_choice', 'radio', 'yes_no',
    'date_time', 'file_upload', 'loop_group', 'computed', 'js_question',
    'repeater', 'final_documents', 'signature_block',
    // Easy mode types
    'true_false', 'phone', 'date', 'time', 'datetime', 'email',
    'number', 'currency', 'scale', 'website', 'display', 'address', 'final',
    // Advanced mode types
    'text', 'boolean', 'phone_advanced', 'datetime_unified', 'choice',
    'email_advanced', 'number_advanced', 'scale_advanced', 'website_advanced',
    'address_advanced', 'multi_field', 'display_advanced',
  ] as const;

  /**
   * Type mapping for AI-friendly names to DB types
   */
  private readonly TYPE_ALIASES: Record<string, string> = {
    'checkbox': 'multiple_choice', // Common AI mistake
    'select': 'choice',
    'dropdown': 'choice',
    'textarea': 'long_text',
    'input': 'short_text',
  };

  /**
   * Normalize workflow types (e.g. map AI-friendly types to DB types)
   */
  private normalizeWorkflowTypes(workflow: AIGeneratedWorkflow): void {
    for (const section of workflow.sections) {
      for (const step of section.steps) {
        // Apply type alias mapping
        if (this.TYPE_ALIASES[step.type]) {
          const originalType = step.type;
          step.type = this.TYPE_ALIASES[step.type] as any;
          logger.debug({ originalType, normalizedType: step.type, stepId: step.id }, 'Normalized step type');
        }

        // Validate against DB schema
        if (!this.VALID_STEP_TYPES.includes(step.type as any)) {
          logger.error({
            invalidType: step.type,
            stepId: step.id,
            stepTitle: step.title,
            validTypes: this.VALID_STEP_TYPES
          }, 'AI generated invalid step type');

          throw this.createError(
            `AI generated invalid step type: "${step.type}" for step "${step.title}"`,
            'VALIDATION_ERROR',
            {
              invalidType: step.type,
              stepId: step.id,
              stepTitle: step.title,
              validTypes: this.VALID_STEP_TYPES,
              suggestion: 'The AI model generated a step type that is not supported by the database. This is a bug in the AI prompt or model behavior.',
            }
          );
        }
      }
    }
  }

  private validateWorkflowStructure(workflow: AIGeneratedWorkflow): void {
    // Check for unique section IDs
    const sectionIds = workflow.sections.map((s) => s.id);
    const uniqueSectionIds = new Set(sectionIds);
    if (sectionIds.length !== uniqueSectionIds.size) {
      throw this.createError(
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
          throw this.createError(
            `Duplicate step ID: ${step.id}`,
            'VALIDATION_ERROR',
          );
        }
        stepIds.add(step.id);

        if (step.alias) {
          if (stepAliases.has(step.alias)) {
            throw this.createError(
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
        throw this.createError(
          `Logic rule references non-existent step alias: ${rule.conditionStepAlias}`,
          'VALIDATION_ERROR',
        );
      }
    }

    // Validate transform blocks reference existing steps
    for (const block of workflow.transformBlocks) {
      for (const inputKey of block.inputKeys) {
        if (!stepAliases.has(inputKey)) {
          throw this.createError(
            `Transform block references non-existent step alias: ${inputKey}`,
            'VALIDATION_ERROR',
          );
        }
      }
    }
  }

  /**
   * Create a typed error with troubleshooting hints
   */
  private createError(
    message: string,
    code: 'INVALID_RESPONSE' | 'API_ERROR' | 'VALIDATION_ERROR' | 'RATE_LIMIT' | 'TIMEOUT' | 'RESPONSE_TRUNCATED',
    details?: any,
  ): Error {
    const troubleshootingHints = this.getTroubleshootingHints(code);
    const fullMessage = troubleshootingHints ? `${message}\n\n${troubleshootingHints}` : message;

    const error = new Error(fullMessage) as any;
    error.code = code;
    error.details = details;
    error.troubleshooting = troubleshootingHints;
    return error;
  }

  /**
   * Get troubleshooting hints for error codes
   */
  private getTroubleshootingHints(code: string): string {
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
   * Suggest random plausible values for workflow steps
   * Used for testing and preview data generation
   */
  async suggestValues(
    steps: Array<{
      key: string;
      type: string;
      label?: string;
      options?: string[];
      description?: string;
    }>,
    mode: 'full' | 'partial' = 'full'
  ): Promise<Record<string, any>> {
    const startTime = Date.now();

    try {
      const prompt = this.buildValueSuggestionPrompt(steps, mode);
      const response = await this.callLLM(prompt, 'value_suggestion');

      // Parse and return the response
      const parsed = JSON.parse(response);

      const duration = Date.now() - startTime;
      logger.info({
        duration,
        stepCount: steps.length,
        mode,
      }, 'AI value suggestion succeeded');

      return parsed.values || parsed;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ error, duration }, 'AI value suggestion failed');

      if (error instanceof SyntaxError) {
        throw this.createError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      throw error;
    }
  }

  /**
   * Build prompt for value suggestion
   */
  private buildValueSuggestionPrompt(
    steps: Array<{
      key: string;
      type: string;
      label?: string;
      options?: string[];
      description?: string;
    }>,
    mode: 'full' | 'partial'
  ): string {
    const stepDescriptions = steps.map(step => {
      let desc = `- ${step.key} (${step.type})`;
      if (step.label) desc += `: ${step.label}`;
      if (step.description) desc += ` - ${step.description}`;
      if (step.options && step.options.length > 0) {
        desc += ` [Options: ${step.options.join(', ')}]`;
      }
      return desc;
    }).join('\n');

    return `You are a test data generator. Generate realistic, plausible values for the following workflow fields.

Fields to populate:
${stepDescriptions}

Requirements:
- Generate realistic values that make sense for each field type
- For text fields, use natural language appropriate to the label
- For radio/checkbox/select fields, choose from the provided options only
- For yes_no fields, return boolean true or false
- For date_time fields, return ISO 8601 date-time strings
- For number fields, return numeric values
- Make the data cohesive and realistic (e.g., if there's firstName and lastName, make them match a person)
- ${mode === 'full' ? 'Generate values for ALL fields' : 'Generate values only for the fields listed'}

Return ONLY a JSON object with this structure:
{
  "values": {
    "key1": "value1",
    "key2": "value2",
    ...
  }
}

Do not include any markdown formatting, code blocks, or additional text. Return raw JSON only.`;
  }

  /**
   * Revise an existing workflow based on user instructions
   * Automatically chunks large workflows to avoid token limits
   *
   * Enhanced with automatic retry logic:
   * - Tries single-shot first for speed
   * - Detects truncation and automatically retries with chunking
   * - Handles workflows up to 10x larger than before
   */
  async reviseWorkflow(
    request: AIWorkflowRevisionRequest,
  ): Promise<AIWorkflowRevisionResponse> {
    const startTime = Date.now();

    try {
      // Estimate token count of the full workflow
      const workflowJson = JSON.stringify(request.currentWorkflow);
      const estimatedInputTokens = this.estimateTokenCount(workflowJson);
      const sectionCount = request.currentWorkflow.sections?.length || 0;

      // Estimate output size based on input
      // Large workflows typically generate 1.5-2x tokens in output
      const estimatedOutputTokens = estimatedInputTokens * 2;

      // Token threshold for chunking (leave headroom for prompt + response)
      // INPUT threshold: If workflow itself is > 2500 tokens, chunk proactively
      // OUTPUT threshold: If estimated output > 6000 tokens, chunk proactively
      const INPUT_CHUNK_THRESHOLD = 2500;
      const OUTPUT_CHUNK_THRESHOLD = 6000;

      const shouldChunkProactively =
        estimatedInputTokens > INPUT_CHUNK_THRESHOLD ||
        estimatedOutputTokens > OUTPUT_CHUNK_THRESHOLD ||
        sectionCount > 15;  // More than 15 sections = chunk

      logger.debug({
        estimatedInputTokens,
        estimatedOutputTokens,
        sectionCount,
        shouldChunkProactively,
        inputThreshold: INPUT_CHUNK_THRESHOLD,
        outputThreshold: OUTPUT_CHUNK_THRESHOLD,
      }, 'Workflow revision token estimation');

      // If workflow is large enough to warrant chunking, use chunked revision immediately
      if (shouldChunkProactively) {
        logger.info({
          estimatedInputTokens,
          estimatedOutputTokens,
          sectionCount,
          reason: estimatedInputTokens > INPUT_CHUNK_THRESHOLD ? 'large_input' :
                  estimatedOutputTokens > OUTPUT_CHUNK_THRESHOLD ? 'large_output' :
                  'many_sections',
        }, 'Workflow large enough to warrant chunking - using chunked revision');

        return await this.reviseWorkflowChunked(request);
      }

      // Otherwise, try single-shot first (faster)
      try {
        logger.info({
          estimatedInputTokens,
          estimatedOutputTokens,
          sectionCount,
        }, 'Attempting single-shot workflow revision');

        return await this.reviseWorkflowSingleShot(request);

      } catch (singleShotError: any) {
        // If single-shot fails due to truncation, automatically retry with chunking
        if (singleShotError.code === 'RESPONSE_TRUNCATED') {
          logger.warn({
            estimatedInputTokens,
            estimatedOutputTokens,
            actualOutputTokens: singleShotError.estimatedTokens,
            responseLength: singleShotError.responseLength,
          }, 'Single-shot revision truncated - automatically retrying with chunking');

          return await this.reviseWorkflowChunked(request);
        }

        // For other errors, re-throw
        throw singleShotError;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ duration, error }, 'AI workflow revision failed');
      throw error;
    }
  }

  /**
   * Single-shot workflow revision (original implementation)
   */
  private async reviseWorkflowSingleShot(
    request: AIWorkflowRevisionRequest,
  ): Promise<AIWorkflowRevisionResponse> {
    const startTime = Date.now();

    try {
      const prompt = this.buildWorkflowRevisionPrompt(request);
      const response = await this.callLLM(prompt, 'workflow_revision');

      // FIRST: Check for truncation BEFORE attempting to parse
      if (this.isResponseTruncated(response)) {
        const estimatedTokens = this.estimateTokenCount(response);
        logger.error({
          responseLength: response.length,
          estimatedTokens,
          responseSuffix: response.substring(Math.max(0, response.length - 500)),
        }, 'Detected truncated AI response - workflow too large for single-shot revision');

        // Throw specific error that will trigger chunking retry
        const error: any = new Error('Response truncated - workflow too large');
        error.code = 'RESPONSE_TRUNCATED';
        error.estimatedTokens = estimatedTokens;
        error.responseLength = response.length;
        throw error;
      }

      // Parse and validate
      let parsed;
      try {
        parsed = JSON.parse(response);
      } catch (parseError: any) {
        // Extract position info from error
        const positionMatch = parseError.message.match(/position (\d+)/);
        const position = positionMatch ? parseInt(positionMatch[1]) : 0;

        // Get context around the error position
        const contextStart = Math.max(0, position - 200);
        const contextEnd = Math.min(response.length, position + 200);
        const errorContext = response.substring(contextStart, contextEnd);

        // Log the actual response for debugging
        logger.error({
          parseError: parseError.message,
          responseLength: response.length,
          responsePreview: response.substring(0, 500),
          responseSuffix: response.substring(Math.max(0, response.length - 500)),
          errorPosition: position,
          errorContext: errorContext,
          errorContextStart: contextStart,
        }, 'Failed to parse AI response as JSON');

        // Write full response to file for debugging
        const fs = require('fs');
        const path = require('path');
        const debugPath = path.join(process.cwd(), 'logs', `ai-response-error-${Date.now()}.json`);
        try {
          fs.mkdirSync(path.dirname(debugPath), { recursive: true });
          fs.writeFileSync(debugPath, response);
          logger.error({ debugPath }, 'Full AI response written to file for debugging');
        } catch (fsError) {
          logger.error({ fsError }, 'Failed to write debug file');
        }

        // Re-throw parse error (truncation should have been caught above)
        throw parseError;
      }
      const validated = AIWorkflowRevisionResponseSchema.parse(parsed);

      // Validate structure of generated workflow
      this.validateWorkflowStructure(validated.updatedWorkflow);

      const duration = Date.now() - startTime;
      logger.info({
        duration,
        workflowId: request.workflowId,
        changeCount: validated.diff.changes.length,
      }, 'AI workflow revision succeeded');

      return validated;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ error, duration }, 'AI workflow revision failed');

      if (error instanceof SyntaxError) {
        throw this.createError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw this.createError(
          'AI response does not match expected schema',
          'VALIDATION_ERROR',
          { originalError: error },
        );
      }

      throw error;
    }
  }

  /**
   * Chunked workflow revision for large workflows
   * Breaks workflow into section groups and processes them independently
   *
   * Enhanced chunking strategy:
   * - Dynamically calculates chunk size based on output token limits
   * - Handles workflows 10x larger than before
   * - Better progress tracking and error recovery
   * - Special handling for single massive sections
   */
  private async reviseWorkflowChunked(
    request: AIWorkflowRevisionRequest,
    skipTwoPassStrategy = false,  // Prevent infinite recursion
  ): Promise<AIWorkflowRevisionResponse> {
    const startTime = Date.now();
    const workflow = request.currentWorkflow;
    const sections = workflow.sections || [];

    if (sections.length === 0) {
      // No sections to chunk, fall back to single shot
      return await this.reviseWorkflowSingleShot(request);
    }

    // EDGE CASE: Single massive section that's too large
    // Chunking by sections won't help - need different strategy
    if (sections.length === 1 && !skipTwoPassStrategy) {
      // Check BOTH the current section size AND the instruction size
      // (instruction often contains the document content)
      const singleSectionSize = this.estimateTokenCount(JSON.stringify(sections[0]));
      const instructionSize = this.estimateTokenCount(request.userInstruction);

      // Use the larger of the two to estimate output
      const largerInputSize = Math.max(singleSectionSize, instructionSize);
      const estimatedOutputSize = largerInputSize * 2;

      if (estimatedOutputSize > 6000) {
        logger.warn({
          sectionSize: singleSectionSize,
          instructionSize,
          largerInputSize,
          estimatedOutputSize,
        }, 'Single section with large content - using two-pass revision strategy');

        // Strategy: Ask AI to create a simplified structure first, then fill details
        return await this.reviseWorkflowInPasses(request);
      }
    }

    logger.info({
      totalSections: sections.length,
      instruction: request.userInstruction,
    }, 'Starting chunked workflow revision');

    // Determine optimal chunk size
    // Calculate average section size in tokens
    const totalWorkflowSize = this.estimateTokenCount(JSON.stringify(workflow));
    const avgSectionInputTokens = Math.ceil(totalWorkflowSize / sections.length);

    // Check if sections are mostly empty (e.g., from Pass 1 of two-pass strategy)
    const hasEmptySections = sections.every(s => !s.steps || s.steps.length === 0);

    // Estimate output tokens per section
    let avgSectionOutputTokens;
    let maxSectionsPerChunk = 10;  // Default for normal sections

    if (hasEmptySections && request.userInstruction) {
      // Empty sections being filled from large instruction (like PDF content)
      // CRITICAL: Each section needs to reference the FULL instruction
      // Real-world data shows ~2600 tokens output per section for 4500-token instruction
      // Use multiplier of 6x instead of 2x
      const instructionSize = this.estimateTokenCount(request.userInstruction);
      avgSectionOutputTokens = Math.max(
        avgSectionInputTokens * 2,
        Math.ceil(instructionSize / sections.length) * 6  // 6x multiplier for empty sections
      );

      // AGGRESSIVE CAPS based on instruction size
      if (instructionSize > 5000) {
        maxSectionsPerChunk = 1;  // Very large instruction = 1 section per chunk
      } else if (instructionSize > 3000) {
        maxSectionsPerChunk = 2;  // Large instruction = 2 sections per chunk
      } else {
        maxSectionsPerChunk = 3;  // Medium instruction = 3 sections per chunk
      }
    } else {
      // Normal case: sections already have content
      avgSectionOutputTokens = avgSectionInputTokens * 2;
    }

    // Maximum output tokens per chunk (leave 20% headroom from 8K limit)
    const MAX_OUTPUT_TOKENS_PER_CHUNK = 6400;  // 80% of 8K

    // Calculate how many sections fit in one chunk
    const sectionsPerChunk = Math.max(1, Math.floor(MAX_OUTPUT_TOKENS_PER_CHUNK / avgSectionOutputTokens));

    // Apply the cap
    const finalSectionsPerChunk = Math.min(sectionsPerChunk, maxSectionsPerChunk);

    const instructionSize = hasEmptySections && request.userInstruction
      ? this.estimateTokenCount(request.userInstruction)
      : 0;

    logger.info({
      totalSections: sections.length,
      hasEmptySections,
      instructionSize,
      avgSectionInputTokens,
      avgSectionOutputTokens,
      sectionsPerChunk: finalSectionsPerChunk,
      maxSectionsPerChunk,
      estimatedChunks: Math.ceil(sections.length / finalSectionsPerChunk),
    }, 'Calculated optimal chunk size');

    // Create section chunks
    const chunks: typeof sections[] = [];
    for (let i = 0; i < sections.length; i += finalSectionsPerChunk) {
      chunks.push(sections.slice(i, i + finalSectionsPerChunk));
    }

    logger.info({
      totalSections: sections.length,
      chunksCount: chunks.length,
      sectionsPerChunk: finalSectionsPerChunk,
      avgSectionInputTokens,
      avgSectionOutputTokens,
    }, 'Workflow chunked for processing');

    // Process chunks sequentially (to maintain context and order)
    // We could do parallel, but sequential gives better context awareness
    const revisedSections: typeof sections = [];
    const allChanges: any[] = [];
    const allExplanations: string[] = [];
    const allSuggestions: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkNumber = i + 1;

      logger.info({
        chunkNumber,
        totalChunks: chunks.length,
        sectionCount: chunk.length,
        sectionTitles: chunk.map(s => s.title),
      }, `Processing chunk ${chunkNumber}/${chunks.length}`);

      try {
        // Create a mini-workflow with just this chunk
        const chunkWorkflow = {
          ...workflow,
          sections: chunk,
        };

        // Create chunk-specific request with context about other chunks
        const chunkRequest: AIWorkflowRevisionRequest = {
          ...request,
          currentWorkflow: chunkWorkflow,
          userInstruction: `${request.userInstruction}

IMPORTANT CONTEXT: You are processing sections ${chunk[0].order + 1}-${chunk[chunk.length - 1].order + 1} out of ${sections.length} total sections in this workflow. Focus your revisions on these sections only. Other sections will be processed separately.

Section titles in this chunk: ${chunk.map(s => s.title).join(', ')}`,
        };

        const chunkResult = await this.reviseWorkflowSingleShot(chunkRequest);

        // Collect revised sections
        if (chunkResult.updatedWorkflow.sections) {
          revisedSections.push(...chunkResult.updatedWorkflow.sections);
        }

        // Collect changes and metadata
        allChanges.push(...(chunkResult.diff?.changes || []));
        allExplanations.push(...(chunkResult.explanation || []));
        allSuggestions.push(...(chunkResult.suggestions || []));

        logger.info({
          chunkNumber,
          revisedSectionCount: chunkResult.updatedWorkflow.sections?.length || 0,
          changesCount: chunkResult.diff?.changes.length || 0,
        }, `Chunk ${chunkNumber}/${chunks.length} completed`);

      } catch (error) {
        logger.error({
          chunkNumber,
          totalChunks: chunks.length,
          error,
        }, `Failed to process chunk ${chunkNumber}, keeping original sections`);

        // On error, keep original sections for this chunk
        revisedSections.push(...chunk);
      }
    }

    // Merge results back together
    const mergedWorkflow = {
      ...workflow,
      sections: revisedSections,
      // Preserve original logic rules and transform blocks
      // (chunking doesn't modify these - only sections)
      logicRules: workflow.logicRules || [],
      transformBlocks: workflow.transformBlocks || [],
    };

    const duration = Date.now() - startTime;

    logger.info({
      duration,
      totalChunks: chunks.length,
      originalSections: sections.length,
      revisedSections: revisedSections.length,
      totalChanges: allChanges.length,
    }, 'Chunked workflow revision completed');

    return {
      updatedWorkflow: mergedWorkflow,
      diff: {
        changes: allChanges,
      },
      explanation: [
        `✨ Large workflow processed in ${chunks.length} chunks for better quality`,
        ...allExplanations,
      ],
      suggestions: [...new Set(allSuggestions)], // Deduplicate suggestions
    };
  }

  /**
   * Two-pass workflow revision for single massive sections
   * Pass 1: Create structure (section titles only)
   * Pass 2: Fill in details (steps for each section)
   */
  private async reviseWorkflowInPasses(
    request: AIWorkflowRevisionRequest,
  ): Promise<AIWorkflowRevisionResponse> {
    const startTime = Date.now();

    logger.info({
      instruction: request.userInstruction,
    }, 'Starting two-pass workflow revision for massive section');

    // PASS 1: Create high-level structure (sections with titles only)
    const structurePrompt = `You are a VaultLogic Workflow Architect.
Your task is to analyze the document and create a HIGH-LEVEL STRUCTURE ONLY.

Document Content:
${request.userInstruction}

IMPORTANT: DO NOT create detailed steps yet. Only create section structure.

Output a JSON object with this structure:
{
  "sections": [
    {
      "title": "Section 1 Title",
      "description": "What this section covers"
    },
    {
      "title": "Section 2 Title",
      "description": "What this section covers"
    }
  ],
  "notes": "Brief overview of the workflow structure"
}

Requirements:
- Create 5-15 logical sections that break down the document
- Each section should cover a distinct part of the document
- Keep descriptions brief (1-2 sentences)
- Output ONLY valid JSON, no markdown

Output ONLY the JSON object.`;

    try {
      // Get structure from AI
      const structureResponse = await this.callLLM(structurePrompt, 'workflow_revision');
      const structureData = JSON.parse(structureResponse);

      logger.info({
        sectionsCreated: structureData.sections?.length || 0,
      }, 'Pass 1 completed - structure created');

      // PASS 2: Create a simplified workflow with the structure
      // Then use normal chunked revision to fill in details
      const structuredWorkflow = {
        ...request.currentWorkflow,
        sections: (structureData.sections || []).map((s: any, idx: number) => ({
          id: `section-${idx + 1}`,
          title: s.title,
          description: s.description || null,
          order: idx,
          steps: [], // Empty - will be filled by chunked revision
        })),
      };

      // Now use chunked revision with the structured workflow
      const structuredRequest = {
        ...request,
        currentWorkflow: structuredWorkflow,
        userInstruction: `${request.userInstruction}\n\nIMPORTANT: Fill in detailed steps for each section based on the document content.`,
      };

      logger.info({
        sectionsToProcess: structuredWorkflow.sections.length,
      }, 'Pass 2 starting - filling section details with chunking');

      // Use the existing chunked logic with recursion prevention
      const result = await this.reviseWorkflowChunked(structuredRequest, true);

      const duration = Date.now() - startTime;
      logger.info({
        duration,
        sectionsProcessed: result.updatedWorkflow.sections?.length || 0,
      }, 'Two-pass workflow revision completed');

      return {
        ...result,
        explanation: [
          `✨ Processed large document using two-pass strategy:`,
          `Pass 1: Created ${structureData.sections?.length || 0} sections`,
          `Pass 2: Filled details for each section`,
          ...(result.explanation || []),
        ],
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({
        duration,
        error: {
          message: error.message,
          code: error.code,
          stack: error.stack,
          name: error.name,
        },
      }, 'Two-pass workflow revision failed');
      throw error;
    }
  }

  /**
   * Build prompt for workflow revision
   */
  private buildWorkflowRevisionPrompt(
    request: AIWorkflowRevisionRequest,
  ): string {
    return `You are a VaultLogic Workflow Revision Engine.
Your task is to modify the Current Workflow based on the User Instruction and Conversation History.

Current Workflow JSON:
${JSON.stringify(request.currentWorkflow, null, 2)}

User Instruction: "${request.userInstruction}"

Conversation History:
${request.conversationHistory ? request.conversationHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n') : 'None'}

Mode: ${request.mode} (Respect constraints of this mode)

Output a JSON object with this exact structure:
{
  "updatedWorkflow": {
    "title": "Workflow Title",
    "description": "Description",
    "sections": [
      {
        "id": "section-1",
        "title": "Section Title",
        "description": null,
        "order": 0,
        "steps": [
          {
            "id": "step-1",
            "type": "short_text",
            "title": "What is your name?",  // REQUIRED - question text
            "description": null,
            "alias": "name",
            "required": true,
            "config": {}
          }
        ]
      }
    ],
    "logicRules": [
      {
        "id": "rule-1",
        "conditionStepAlias": "step_alias",  // REQUIRED - alias of step to check
        "operator": "equals",  // REQUIRED - use: equals, not_equals, contains, greater_than, less_than, is_empty, etc. (never use "is")
        "value": "some value",  // Value to compare against
        "targetType": "step",  // REQUIRED - "step" or "section"
        "targetAlias": "other_step",  // REQUIRED - alias of step/section to affect
        "action": "show",  // REQUIRED - "show", "hide", "require", "make_optional", or "skip_to"
        "description": "Show other_step if step_alias equals 'some value'"
      }
    ],
    "transformBlocks": [],
    "notes": null
  },
  "diff": {
    "changes": [
      {
        "type": "add|remove|update|move",
        "target": "path.to.element",
        "before": null,
        "after": { ... },
        "explanation": "Added a new specific question"
      }
    ]
  },
  "explanation": ["Point 1 about what changed", "Point 2"],
  "suggestions": ["Follow-up suggestion 1"]
}

CRITICAL REQUIREMENTS:
    1. **FULL RESPONSE REQUIRED**: You MUST return the ENTIRE workflow structure in 'updatedWorkflow', including ALL existing sections and steps that you did not change.
    2. **DELETION WARNING**: Any section or step that is missing from your 'updatedWorkflow' will be PERMANENTLY DELETED. Do not be lazy.
    3. **TITLES**: Every step MUST have a "title" field.
    4. **IDS**: Preserve existing IDs. Generate new UUIDs for new items.
    5. **CONTENT GENERATION**: If the User Instruction asks to "build", "create", or "automate" a form/workflow, and the current workflow has few or no questions, you MUST generate the full structure (multiple sections, relevant questions). DO NOT just update the title. YOU MUST BUILD THE CONTENT.
    6. **ALIASES**: Every step MUST have a unique "alias" in camelCase (e.g., "firstName", "driverLicenseNumber"). Do not leave it null or empty.

    Valid Step Types:
    - Text: "short_text", "long_text", "email", "phone", "website", "number", "currency"
    - Choice: "radio", "multiple_choice", "yes_no"
    - Date: "date", "time", "date_time"
    - Other: "scale", "address", "file_upload", "display", "signature_block"

    Output ONLY the JSON object.`;
  }
  /**
   * Generate logic connections based on natural language description
   */
  async generateLogic(
    request: AIConnectLogicRequest,
  ): Promise<AIConnectLogicResponse> {
    const startTime = Date.now();

    try {
      const prompt = this.buildLogicGenerationPrompt(request);
      const response = await this.callLLM(prompt, 'logic_generation');

      const parsed = JSON.parse(response);
      const validated = AIConnectLogicResponseSchema.parse(parsed);

      const duration = Date.now() - startTime;
      logger.info({
        duration,
        workflowId: request.workflowId,
        changeCount: validated.diff.changes.length,
      }, 'AI logic generation succeeded');

      return validated;
    } catch (error) {
      if (error instanceof SyntaxError || (error instanceof Error && error.name === 'ZodError')) {
        throw this.createError('Invalid AI Response', 'VALIDATION_ERROR', { originalError: error });
      }
      throw error;
    }
  }

  /**
   * Debug logic for contradictions and issues
   */
  async debugLogic(
    request: AIDebugLogicRequest,
  ): Promise<AIDebugLogicResponse> {
    const startTime = Date.now();

    try {
      const prompt = this.buildLogicDebugPrompt(request);
      const response = await this.callLLM(prompt, 'logic_debug');

      const parsed = JSON.parse(response);
      const validated = AIDebugLogicResponseSchema.parse(parsed);

      const duration = Date.now() - startTime;
      logger.info({
        duration,
        workflowId: request.workflowId,
        issuesCount: validated.issues.length,
        fixesCount: validated.recommendedFixes.length,
      }, 'AI logic debug succeeded');

      return validated;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ error, duration }, 'AI logic debug failed');

      if (error instanceof SyntaxError) {
        throw this.createError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw this.createError(
          'AI response does not match expected schema',
          'VALIDATION_ERROR',
          { originalError: error },
        );
      }

      throw error;
    }
  }

  /**
   * Visualize logic as a graph
   */
  async visualizeLogic(
    request: AIVisualizeLogicRequest,
  ): Promise<AIVisualizeLogicResponse> {
    const startTime = Date.now();

    try {
      const prompt = this.buildLogicVisualizationPrompt(request);
      const response = await this.callLLM(prompt, 'logic_visualization');

      const parsed = JSON.parse(response);
      const validated = AIVisualizeLogicResponseSchema.parse(parsed);

      const duration = Date.now() - startTime;
      logger.info({
        duration,
        workflowId: request.workflowId,
        nodesCount: validated.graph.nodes.length,
        edgesCount: validated.graph.edges.length,
      }, 'AI logic visualization succeeded');

      return validated;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ error, duration }, 'AI logic visualization failed');

      if (error instanceof SyntaxError) {
        throw this.createError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw this.createError(
          'AI response does not match expected schema',
          'VALIDATION_ERROR',
          { originalError: error },
        );
      }

      throw error;
    }
  }

  private buildLogicGenerationPrompt(request: AIConnectLogicRequest): string {
    return `You are a Logic Architect for VaultLogic.
Task: Generate logical conditions (logicRules) to connect steps based on the user's description.
Workflow Context:
${JSON.stringify(request.currentWorkflow, null, 2)}
User Request: "${request.description}"

Output JSON exactly matching AIConnectLogicResponse schema:
{
  "updatedWorkflow": { ... },
  "diff": { "changes": [...] },
  "explanation": ["..."],
  "suggestions": ["..."]
}
Only return JSON.`;
  }

  private buildLogicDebugPrompt(request: AIDebugLogicRequest): string {
    return `Analyze this workflow's logic for infinite loops, contradictions, or unreachable branches.
Workflow: ${JSON.stringify(request.currentWorkflow, null, 2)}
Output JSON matching AIDebugLogicResponse.`;
  }

  private buildLogicVisualizationPrompt(request: AIVisualizeLogicRequest): string {
    return `Generate a node-edge graph representation of this workflow's logic flow.
Workflow: ${JSON.stringify(request.currentWorkflow, null, 2)}
Output JSON matching AIVisualizeLogicResponse with "graph": { "nodes": [], "edges": [] }.`;
  }

}
export function createAIServiceFromEnv(): AIService {
  // Check for GEMINI_API_KEY first (preferred for VaultLogic features)
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    // Use configurable Gemini model from env, fallback to gemini-2.0-flash
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    logger.info({ provider: 'gemini', model }, 'AI Service initialized');
    const config: AIProviderConfig = {
      provider: 'gemini' as AIProvider,
      apiKey: geminiKey,
      model,
      temperature: 0.7,
      maxTokens: 4000,  // Will be overridden by task-specific limits (65536 for revisions)
    };
    return new AIService(config);
  }

  // Fall back to AI_API_KEY with AI_PROVIDER
  const provider = (process.env.AI_PROVIDER || 'openai') as AIProvider;
  const apiKey = process.env.AI_API_KEY;

  if (!apiKey) {
    const errorMsg = [
      '═'.repeat(80),
      '❌ AI SERVICE CONFIGURATION ERROR',
      '═'.repeat(80),
      '',
      'No AI provider API key found. The AI Builder feature requires an API key.',
      '',
      'To fix this issue, set ONE of the following environment variables:',
      '',
      '  Option 1 (Recommended): GEMINI_API_KEY',
      '    Get your key at: https://makersuite.google.com/app/apikey',
      '    Example: GEMINI_API_KEY=AIzaSy...',
      '',
      '  Option 2: AI_API_KEY + AI_PROVIDER',
      '    For OpenAI: https://platform.openai.com/api-keys',
      '    For Anthropic: https://console.anthropic.com/',
      '    Example: AI_API_KEY=sk-... AI_PROVIDER=openai',
      '',
      'Without an API key, the following features will NOT work:',
      '  - AI workflow generation',
      '  - AI workflow suggestions',
      '  - Template binding suggestions',
      '  - Logic generation and debugging',
      '',
      '═'.repeat(80),
    ].join('\n');

    throw new Error(errorMsg);
  }

  const modelWorkflow = process.env.AI_MODEL_WORKFLOW || getDefaultModel(provider);

  logger.info({ provider, model: modelWorkflow }, 'AI Service initialized');

  const config: AIProviderConfig = {
    provider,
    apiKey,
    model: modelWorkflow,
    temperature: 0.7,
    maxTokens: 4000,
  };

  return new AIService(config);
}

/**
 * Validate AI configuration at startup (non-throwing)
 * Returns true if AI is configured, false otherwise
 */
export function validateAIConfig(): { configured: boolean; provider?: string; model?: string; error?: string } {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      return { configured: true, provider: 'gemini', model };
    }

    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      return {
        configured: false,
        error: 'No API key configured. Set GEMINI_API_KEY or AI_API_KEY environment variable.'
      };
    }

    const provider = process.env.AI_PROVIDER || 'openai';
    const model = process.env.AI_MODEL_WORKFLOW || getDefaultModel(provider as AIProvider);

    return { configured: true, provider, model };
  } catch (error: any) {
    return { configured: false, error: error.message };
  }
}

/**
 * Get default model for provider
 */
function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4-turbo-preview';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'gemini':
      return 'gemini-2.0-flash';
    default:
      throw new Error(`Unknown provider: ${provider} `);
  }
}
