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
      this.openaiClient = new OpenAI({ apiKey: config.apiKey });
    } else if (config.provider === 'anthropic') {
      this.anthropicClient = new Anthropic({ apiKey: config.apiKey });
    } else if (config.provider === 'gemini') {
      const genAI = new GoogleGenerativeAI(config.apiKey);
      this.geminiClient = genAI.getGenerativeModel({ model: config.model });
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

      // Validate workflow structure
      this.validateWorkflowStructure(validated);

      const duration = Date.now() - startTime;
      logger.info({
        duration,
        sectionsCount: validated.sections.length,
        rulesCount: validated.logicRules.length,
        blocksCount: validated.transformBlocks.length,
      }, 'AI workflow generation succeeded');

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

    return `You are a workflow designer for VaultLogic, a document automation and workflow platform.
Your task is to design a workflow based on the user's description.

User Description:
${request.description}

${request.placeholders ? `Template Placeholders Available:\n${request.placeholders.join(', ')}\n` : ''}

Output a JSON object with this exact structure:
{
  "name": "Workflow Name",
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

Constraints:
- Maximum ${maxSections} sections
- Maximum ${maxStepsPerSection} steps per section
- All step aliases must be unique across the workflow
- All IDs must be unique and use lowercase with underscores
- For multiple_choice, radio, checkbox types, include config.options as string array
- Keep logic rules simple and practical
- Use transform blocks for calculations, concatenations, or data transformations
- NO network calls in transform blocks
- NO file system access in transform blocks
- Transform block code should call emit(value) exactly once

Available Step Types:
- short_text: Single-line text input
- long_text: Multi-line text area
- multiple_choice: Multiple selection checkboxes
- radio: Single selection radio buttons
- checkbox: Checkbox (yes/no with custom labels)
- yes_no: Simple yes/no question
- date_time: Date and/or time picker
- file_upload: File upload field

Output ONLY the JSON object, no additional text or markdown.`;
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
   * Call the configured LLM provider
   */
  /**
   * Call the configured LLM provider with retry logic
   */
  private async callLLM(
    prompt: string,
    taskType: 'workflow_generation' | 'workflow_suggestion' | 'binding_suggestion',
  ): Promise<string> {
    const { provider, model, temperature = 0.7, maxTokens = 4000 } = this.config;
    const maxRetries = 3;
    let attempt = 0;

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
          return text;
        } else if (provider === 'gemini' && this.geminiClient) {
          const result = await this.geminiClient.generateContent(prompt);
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

            if (waitMs <= 15000) {
              logger.warn({ attempt, waitMs }, 'Rate limit hit, retrying...');
              await new Promise(resolve => setTimeout(resolve, waitMs));
              attempt++;
              continue;
            }
          }

          // Otherwise, throw explicit rate limit error
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
          throw this.createError('AI API request timed out', 'TIMEOUT', { originalError: error.message });
        }

        // Generic API error - do not retry
        throw this.createError(
          `AI API error: ${error.message}`,
          'API_ERROR',
          { originalError: error }
        );
      }
    }

    throw new Error('Unexpected retry loop exit');
  }

  /**
   * Validate workflow structure (business rules beyond schema)
   */
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
   * Create a typed error
   */
  private createError(
    message: string,
    code: 'INVALID_RESPONSE' | 'API_ERROR' | 'VALIDATION_ERROR' | 'RATE_LIMIT' | 'TIMEOUT',
    details?: any,
  ): Error {
    const error = new Error(message) as any;
    error.code = code;
    error.details = details;
    return error;
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
      const response = await this.callLLM(prompt, 'value_suggestion' as any);

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
   */
  async reviseWorkflow(
    request: AIWorkflowRevisionRequest,
  ): Promise<AIWorkflowRevisionResponse> {
    const startTime = Date.now();

    try {
      const prompt = this.buildWorkflowRevisionPrompt(request);
      const response = await this.callLLM(prompt, 'workflow_revision' as any);

      // Parse and validate
      const parsed = JSON.parse(response);
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
  "updatedWorkflow": { ...complete workflow JSON... },
  "diff": {
    "changes": [
      {
        "type": "add|remove|update|move",
        "target": "path.to.element", // e.g. "sections[0].steps[1]"
        "before": null, // value before change
        "after": { ... }, // value after change
        "explanation": "Added a new specific question"
      }
    ]
  },
  "explanation": ["Point 1 about what changed", "Point 2"],
  "suggestions": ["Follow-up suggestion 1"]
}

Guidelines:
1. Ground Truth: The "updatedWorkflow" MUST be the complete, valid new state.
2. Minimal Changes: Only change what is requested. Preserve existing IDs and config unless explicitly asked to change.
3. Integrity: Ensure all IDs remain unique. Ensure logic rules reference valid aliases.
4. Revision Types:
   - "Add question": Insert new step.
   - "Make conditional": Add a logicRule.
   - "Delete": Remove section/step/rule.
   - "Refine": Update text/labels.
5. Smart Defaults: If the user says "Add a phone number", determine the best step type (short_text) and validation logic automatically.

Output ONLY the JSON object, no additional text or markdown.`;
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
      const response = await this.callLLM(prompt, 'logic_generation' as any);

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
    const prompt = this.buildLogicDebugPrompt(request);
    const response = await this.callLLM(prompt, 'logic_debug' as any);
    const parsed = JSON.parse(response);
    return parsed as AIDebugLogicResponse; // TODO: Schema validation
  }

  /**
   * Visualize logic as a graph
   */
  async visualizeLogic(
    request: AIVisualizeLogicRequest,
  ): Promise<AIVisualizeLogicResponse> {
    // For now, simpler implementation or mock
    // In a real implementation, this might ask LLM to generate Mermaid or JSON graph
    // or we compute it deterministically.
    // For this task, we'll ask LLM to analyze and return graph structure.
    const prompt = this.buildLogicVisualizationPrompt(request);
    const response = await this.callLLM(prompt, 'logic_visualization' as any);
    const parsed = JSON.parse(response);
    return parsed as AIVisualizeLogicResponse;
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
    const config: AIProviderConfig = {
      provider: 'gemini' as AIProvider,
      apiKey: geminiKey,
      model: 'gemini-2.0-flash-exp',
      temperature: 0.7,
      maxTokens: 4000,
    };
    return new AIService(config);
  }

  // Fall back to AI_API_KEY with AI_PROVIDER
  const provider = (process.env.AI_PROVIDER || 'openai') as AIProvider;
  const apiKey = process.env.AI_API_KEY;

  if (!apiKey) {
    throw new Error('Either GEMINI_API_KEY or AI_API_KEY environment variable is required');
  }

  const modelWorkflow = process.env.AI_MODEL_WORKFLOW || getDefaultModel(provider);

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
 * Get default model for provider
 */
function getDefaultModel(provider: AIProvider): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4-turbo-preview';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'gemini':
      return 'gemini-2.0-flash-exp';
    default:
      throw new Error(`Unknown provider: ${provider} `);
  }
}
