/**
 * AI Service for Workflow Generation (Refactored)
 *
 * This service integrates with OpenAI, Anthropic, and Gemini APIs to generate workflow
 * specifications from natural language descriptions.
 *
 * Features:
 * - Generate new workflows from text descriptions
 * - Suggest improvements to existing workflows
 * - Suggest template variable bindings
 * - Revise workflows based on user instructions
 * - Generate, debug, and visualize logic rules
 * - Robust error handling and validation
 * - Rate limiting protection
 * - Chunking support for large workflows
 */

import {
  AIGeneratedWorkflowSchema,
  AIWorkflowSuggestionSchema,
  AITemplateBindingsResponseSchema,
  AIWorkflowRevisionResponseSchema,
  AIConnectLogicResponseSchema,
  AIDebugLogicResponseSchema,
  AIVisualizeLogicResponseSchema,
} from '../../shared/types/ai';
import { createLogger } from '../logger';

import {
  VALID_STEP_TYPES,
  TYPE_ALIASES,
  estimateTokenCount,
  isResponseTruncated,
  createAIError,
} from './ai';
import { aiPromptBuilder } from './ai/AIPromptBuilder';
import { AIProviderClient } from './ai/AIProviderClient';
import { workflowQualityValidator } from './WorkflowQualityValidator';

import type {
  AIProvider,
  AIProviderConfig,
  AIGeneratedWorkflow,
  AIWorkflowGenerationRequest,
  AIWorkflowSuggestion,
  AIWorkflowSuggestionRequest,
  AITemplateBindingsResponse,
  AITemplateBindingsRequest,
  AIWorkflowRevisionRequest,
  AIWorkflowRevisionResponse,
  AIConnectLogicRequest,
  AIConnectLogicResponse,
  AIDebugLogicRequest,
  AIDebugLogicResponse,
  AIVisualizeLogicRequest,
  AIVisualizeLogicResponse,
} from '../../shared/types/ai';

const logger = createLogger({ module: 'ai-service' });

/**
 * AI Service for workflow generation and suggestions
 */
export class AIService {
  private providerClient: AIProviderClient;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.providerClient = new AIProviderClient(config);
  }

  /**
   * Generate a new workflow from a natural language description
   */
  async generateWorkflow(
    request: AIWorkflowGenerationRequest,
  ): Promise<AIGeneratedWorkflow> {
    const startTime = Date.now();

    try {
      const prompt = aiPromptBuilder.buildWorkflowGenerationPrompt(request);
      const response = await this.providerClient.callLLM(prompt, 'workflow_generation');

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
        throw createAIError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw createAIError(
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
      const prompt = aiPromptBuilder.buildWorkflowSuggestionPrompt(request, existingWorkflow);
      const response = await this.providerClient.callLLM(prompt, 'workflow_suggestion');

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
        throw createAIError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw createAIError(
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
      const prompt = aiPromptBuilder.buildBindingSuggestionPrompt(variables, placeholders);
      const response = await this.providerClient.callLLM(prompt, 'binding_suggestion');

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
        throw createAIError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw createAIError(
          'AI response does not match expected schema',
          'VALIDATION_ERROR',
          { originalError: error },
        );
      }

      throw error;
    }
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
      const prompt = aiPromptBuilder.buildValueSuggestionPrompt(steps, mode);
      const response = await this.providerClient.callLLM(prompt, 'value_suggestion');

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
        throw createAIError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      throw error;
    }
  }

  /**
   * Revise an existing workflow based on user instructions
   * Automatically chunks large workflows to avoid token limits
   */
  async reviseWorkflow(
    request: AIWorkflowRevisionRequest,
  ): Promise<AIWorkflowRevisionResponse> {
    const startTime = Date.now();

    try {
      // Estimate token count of the full workflow
      const workflowJson = JSON.stringify(request.currentWorkflow);
      const estimatedInputTokens = estimateTokenCount(workflowJson);
      const sectionCount = request.currentWorkflow.sections?.length || 0;

      // Estimate output size based on input
      const estimatedOutputTokens = estimatedInputTokens * 2;

      // Token thresholds for chunking
      const INPUT_CHUNK_THRESHOLD = 2500;
      const OUTPUT_CHUNK_THRESHOLD = 6000;

      const shouldChunkProactively =
        estimatedInputTokens > INPUT_CHUNK_THRESHOLD ||
        estimatedOutputTokens > OUTPUT_CHUNK_THRESHOLD ||
        sectionCount > 15;

      logger.debug({
        estimatedInputTokens,
        estimatedOutputTokens,
        sectionCount,
        shouldChunkProactively,
      }, 'Workflow revision token estimation');

      // If workflow is large, use chunked revision immediately
      if (shouldChunkProactively) {
        logger.info({
          estimatedInputTokens,
          estimatedOutputTokens,
          sectionCount,
        }, 'Workflow large - using chunked revision');

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
          }, 'Single-shot revision truncated - retrying with chunking');

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
   * Single-shot workflow revision
   */
  private async reviseWorkflowSingleShot(
    request: AIWorkflowRevisionRequest,
  ): Promise<AIWorkflowRevisionResponse> {
    const startTime = Date.now();

    try {
      const prompt = aiPromptBuilder.buildWorkflowRevisionPrompt(request);
      const response = await this.providerClient.callLLM(prompt, 'workflow_revision');

      // Check for truncation BEFORE parsing
      if (isResponseTruncated(response)) {
        const estimatedTokens = estimateTokenCount(response);
        logger.error({
          responseLength: response.length,
          estimatedTokens,
        }, 'Detected truncated AI response');

        const error: any = new Error('Response truncated - workflow too large');
        error.code = 'RESPONSE_TRUNCATED';
        error.estimatedTokens = estimatedTokens;
        error.responseLength = response.length;
        throw error;
      }

      // Parse and validate
      const parsed = JSON.parse(response);
      const validated = AIWorkflowRevisionResponseSchema.parse(parsed);

      // Validate structure
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
        throw createAIError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw createAIError(
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
   */
  private async reviseWorkflowChunked(
    request: AIWorkflowRevisionRequest,
    skipTwoPassStrategy = false,
  ): Promise<AIWorkflowRevisionResponse> {
    const startTime = Date.now();
    const workflow = request.currentWorkflow;
    const sections = workflow.sections || [];

    if (sections.length === 0) {
      return this.reviseWorkflowSingleShot(request);
    }

    // Edge case: Single massive section
    if (sections.length === 1 && !skipTwoPassStrategy) {
      const singleSectionSize = estimateTokenCount(JSON.stringify(sections[0]));
      const instructionSize = estimateTokenCount(request.userInstruction);
      const largerInputSize = Math.max(singleSectionSize, instructionSize);
      const estimatedOutputSize = largerInputSize * 2;

      if (estimatedOutputSize > 6000) {
        logger.warn({
          sectionSize: singleSectionSize,
          instructionSize,
          estimatedOutputSize,
        }, 'Single section with large content - using two-pass strategy');

        return this.reviseWorkflowInPasses(request);
      }
    }

    logger.info({
      totalSections: sections.length,
    }, 'Starting chunked workflow revision');

    // Calculate optimal chunk size
    const totalWorkflowSize = estimateTokenCount(JSON.stringify(workflow));
    const avgSectionInputTokens = Math.ceil(totalWorkflowSize / sections.length);
    const hasEmptySections = sections.every(s => !s.steps || s.steps.length === 0);

    let avgSectionOutputTokens;
    let maxSectionsPerChunk = 10;

    if (hasEmptySections && request.userInstruction) {
      const instructionSize = estimateTokenCount(request.userInstruction);
      avgSectionOutputTokens = Math.max(
        avgSectionInputTokens * 2,
        Math.ceil(instructionSize / sections.length) * 6
      );

      if (instructionSize > 5000) {
        maxSectionsPerChunk = 1;
      } else if (instructionSize > 3000) {
        maxSectionsPerChunk = 2;
      } else {
        maxSectionsPerChunk = 3;
      }
    } else {
      avgSectionOutputTokens = avgSectionInputTokens * 2;
    }

    const MAX_OUTPUT_TOKENS_PER_CHUNK = 6400;
    const sectionsPerChunk = Math.max(1, Math.floor(MAX_OUTPUT_TOKENS_PER_CHUNK / avgSectionOutputTokens));
    const finalSectionsPerChunk = Math.min(sectionsPerChunk, maxSectionsPerChunk);

    logger.info({
      totalSections: sections.length,
      hasEmptySections,
      sectionsPerChunk: finalSectionsPerChunk,
      estimatedChunks: Math.ceil(sections.length / finalSectionsPerChunk),
    }, 'Calculated optimal chunk size');

    // Create section chunks
    const chunks: typeof sections[] = [];
    for (let i = 0; i < sections.length; i += finalSectionsPerChunk) {
      chunks.push(sections.slice(i, i + finalSectionsPerChunk));
    }

    // Process chunks sequentially
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
      }, `Processing chunk ${chunkNumber}/${chunks.length}`);

      try {
        const chunkWorkflow = {
          ...workflow,
          sections: chunk,
        };

        const chunkRequest: AIWorkflowRevisionRequest = {
          ...request,
          currentWorkflow: chunkWorkflow,
          userInstruction: `${request.userInstruction}

IMPORTANT CONTEXT: You are processing sections ${chunk[0].order + 1}-${chunk[chunk.length - 1].order + 1} out of ${sections.length} total sections. Focus on these sections only.`,
        };

        const chunkResult = await this.reviseWorkflowSingleShot(chunkRequest);

        if (chunkResult.updatedWorkflow.sections) {
          revisedSections.push(...chunkResult.updatedWorkflow.sections);
        }

        allChanges.push(...(chunkResult.diff?.changes || []));
        allExplanations.push(...(chunkResult.explanation || []));
        allSuggestions.push(...(chunkResult.suggestions || []));

      } catch (error) {
        logger.error({
          chunkNumber,
          error,
        }, `Failed to process chunk ${chunkNumber}, keeping original sections`);

        revisedSections.push(...chunk);
      }
    }

    const mergedWorkflow = {
      ...workflow,
      sections: revisedSections,
      logicRules: workflow.logicRules || [],
      transformBlocks: workflow.transformBlocks || [],
    };

    const duration = Date.now() - startTime;

    logger.info({
      duration,
      totalChunks: chunks.length,
      originalSections: sections.length,
      revisedSections: revisedSections.length,
    }, 'Chunked workflow revision completed');

    return {
      updatedWorkflow: mergedWorkflow,
      diff: {
        changes: allChanges,
      },
      explanation: [
        `✨ Large workflow processed in ${chunks.length} chunks`,
        ...allExplanations,
      ],
      suggestions: [...new Set(allSuggestions)],
    };
  }

  /**
   * Two-pass workflow revision for single massive sections
   */
  private async reviseWorkflowInPasses(
    request: AIWorkflowRevisionRequest,
  ): Promise<AIWorkflowRevisionResponse> {
    const startTime = Date.now();

    logger.info('Starting two-pass workflow revision');

    // Pass 1: Create structure only
    const structurePrompt = `You are a VaultLogic Workflow Architect.
Create a HIGH-LEVEL STRUCTURE ONLY from this document.

Document Content:
${request.userInstruction}

DO NOT create detailed steps. Only create section structure.

Output JSON:
{
  "sections": [
    { "title": "Section Title", "description": "What this covers" }
  ],
  "notes": "Brief overview"
}

Output ONLY the JSON object.`;

    try {
      const structureResponse = await this.providerClient.callLLM(structurePrompt, 'workflow_revision');
      const structureData = JSON.parse(structureResponse);

      logger.info({
        sectionsCreated: structureData.sections?.length || 0,
      }, 'Pass 1 completed - structure created');

      // Pass 2: Fill in details with chunking
      const structuredWorkflow = {
        ...request.currentWorkflow,
        sections: (structureData.sections || []).map((s: any, idx: number) => ({
          id: `section-${idx + 1}`,
          title: s.title,
          description: s.description || null,
          order: idx,
          steps: [],
        })),
      };

      const structuredRequest = {
        ...request,
        currentWorkflow: structuredWorkflow,
        userInstruction: `${request.userInstruction}\n\nFill in detailed steps for each section.`,
      };

      const result = await this.reviseWorkflowChunked(structuredRequest, true);

      const duration = Date.now() - startTime;
      logger.info({ duration }, 'Two-pass workflow revision completed');

      return {
        ...result,
        explanation: [
          `✨ Processed using two-pass strategy`,
          `Pass 1: Created ${structureData.sections?.length || 0} sections`,
          `Pass 2: Filled details`,
          ...(result.explanation || []),
        ],
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({ duration, error }, 'Two-pass workflow revision failed');
      throw error;
    }
  }

  /**
   * Generate logic connections
   */
  async generateLogic(
    request: AIConnectLogicRequest,
  ): Promise<AIConnectLogicResponse> {
    const startTime = Date.now();

    try {
      const prompt = aiPromptBuilder.buildLogicGenerationPrompt(request);
      const response = await this.providerClient.callLLM(prompt, 'logic_generation');

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
        throw createAIError('Invalid AI Response', 'VALIDATION_ERROR', { originalError: error });
      }
      throw error;
    }
  }

  /**
   * Debug logic for contradictions
   */
  async debugLogic(
    request: AIDebugLogicRequest,
  ): Promise<AIDebugLogicResponse> {
    const startTime = Date.now();

    try {
      const prompt = aiPromptBuilder.buildLogicDebugPrompt(request);
      const response = await this.providerClient.callLLM(prompt, 'logic_debug');

      const parsed = JSON.parse(response);
      const validated = AIDebugLogicResponseSchema.parse(parsed);

      const duration = Date.now() - startTime;
      logger.info({
        duration,
        workflowId: request.workflowId,
        issuesCount: validated.issues.length,
      }, 'AI logic debug succeeded');

      return validated;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ error, duration }, 'AI logic debug failed');

      if (error instanceof SyntaxError) {
        throw createAIError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw createAIError(
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
      const prompt = aiPromptBuilder.buildLogicVisualizationPrompt(request);
      const response = await this.providerClient.callLLM(prompt, 'logic_visualization');

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
        throw createAIError(
          'Failed to parse AI response as JSON',
          'INVALID_RESPONSE',
          { originalError: error.message },
        );
      }

      if (error instanceof Error && error.name === 'ZodError') {
        throw createAIError(
          'AI response does not match expected schema',
          'VALIDATION_ERROR',
          { originalError: error },
        );
      }

      throw error;
    }
  }

  /**
   * Normalize workflow types (map AI-friendly types to DB types)
   */
  private normalizeWorkflowTypes(workflow: AIGeneratedWorkflow): void {
    for (const section of workflow.sections) {
      for (const step of section.steps) {
        // Apply type alias mapping
        if (TYPE_ALIASES[step.type]) {
          const originalType = step.type;
          step.type = TYPE_ALIASES[step.type] as any;
          logger.debug({ originalType, normalizedType: step.type, stepId: step.id }, 'Normalized step type');
        }

        // Validate against DB schema
        if (!VALID_STEP_TYPES.includes(step.type as any)) {
          logger.error({
            invalidType: step.type,
            stepId: step.id,
            stepTitle: step.title,
          }, 'AI generated invalid step type');

          throw createAIError(
            `AI generated invalid step type: "${step.type}" for step "${step.title}"`,
            'VALIDATION_ERROR',
            {
              invalidType: step.type,
              stepId: step.id,
              stepTitle: step.title,
              validTypes: VALID_STEP_TYPES,
            }
          );
        }
      }
    }
  }

  /**
   * Validate workflow structure
   */
  private validateWorkflowStructure(workflow: AIGeneratedWorkflow): void {
    // Check for unique section IDs
    const sectionIds = workflow.sections.map((s) => s.id);
    const uniqueSectionIds = new Set(sectionIds);
    if (sectionIds.length !== uniqueSectionIds.size) {
      throw createAIError(
        'Duplicate section IDs found in generated workflow',
        'VALIDATION_ERROR',
      );
    }

    // Check for unique step IDs and aliases
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

    // Validate logic rules reference existing steps
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
}

/**
 * Create AIService instance from environment variables
 */
export function createAIServiceFromEnv(): AIService {
  // Check for GEMINI_API_KEY first
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    logger.info({ provider: 'gemini', model }, 'AI Service initialized');
    const config: AIProviderConfig = {
      provider: 'gemini' as AIProvider,
      apiKey: geminiKey,
      model,
      temperature: 0.7,
      maxTokens: 4000,
    };
    return new AIService(config);
  }

  // Fall back to AI_API_KEY
  const provider = (process.env.AI_PROVIDER || 'openai') as AIProvider;
  const apiKey = process.env.AI_API_KEY;

  if (!apiKey) {
    const errorMsg = [
      '═'.repeat(80),
      '❌ AI SERVICE CONFIGURATION ERROR',
      '═'.repeat(80),
      '',
      'No AI provider API key found. Set GEMINI_API_KEY or AI_API_KEY.',
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
      throw new Error(`Unknown provider: ${provider}`);
  }
}
