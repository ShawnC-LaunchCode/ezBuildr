/**
 * AI Service Facade
 *
 * This service acts as a unified entry point for all AI capabilities,
 * delegating actual work to specialized services.
 *
 * Features:
 * - Workflow Generation (via WorkflowGenerationService)
 * - Workflow Suggestions (via WorkflowSuggestionService)
 * - Logic Assistance (via WorkflowLogicService)
 * - Workflow Optimization (via WorkflowOptimizationService)
 */
import {
  AIProviderConfig,
  AIProvider,
  AIGeneratedWorkflow,
  AIWorkflowGenerationRequest,
  AIWorkflowSuggestion,
  AIWorkflowSuggestionRequest,
  AITemplateBindingsResponse,
  AITemplateBindingsRequest,
  AIConnectLogicRequest,
  AIConnectLogicResponse,
  AIVisualizeLogicRequest,
  AIVisualizeLogicResponse,
} from '../../shared/types/ai';
import { createLogger } from '../logger';

import { AIPromptBuilder } from './ai/AIPromptBuilder';
import { AIProviderClient } from './ai/AIProviderClient';
import { QualityImprovementConfig, ImprovementResult } from './ai/IterativeQualityImprover';
import { ModelRegistry } from './ai/ModelRegistry';
import { WorkflowGenerationService } from './ai/WorkflowGenerationService';
import { WorkflowLogicService } from './ai/WorkflowLogicService';
import { workflowOptimizationService, WorkflowOptimizationService } from './ai/WorkflowOptimizationService';
import { WorkflowSuggestionService } from './ai/WorkflowSuggestionService';
import { WorkflowWithAliases } from './AliasResolver';
import { QualityScore } from './WorkflowQualityValidator';
const logger = createLogger({ module: 'ai-service' });
/**
 * AI Service for workflow generation and suggestions
 */
export class AIService {
  private generationService: WorkflowGenerationService;
  private suggestionService: WorkflowSuggestionService;
  private logicService: WorkflowLogicService;
  private optimizationService: WorkflowOptimizationService;
  // Keep config for potential introspection
  private config: AIProviderConfig;
  constructor(config: AIProviderConfig) {
    this.config = config;
    // Initialize shared dependencies
    const client = new AIProviderClient(config);
    const promptBuilder = new AIPromptBuilder();
    // Initialize specialized services
    this.generationService = new WorkflowGenerationService(client, promptBuilder);
    this.suggestionService = new WorkflowSuggestionService(client, promptBuilder);
    this.logicService = new WorkflowLogicService(client, promptBuilder);
    this.optimizationService = workflowOptimizationService;
  }
  /**
   * Generate a new workflow from a natural language description
   */
  async generateWorkflow(
    request: AIWorkflowGenerationRequest,
  ): Promise<AIGeneratedWorkflow> {
    return this.generationService.generateWorkflow(request);
  }

  /**
   * Generate a workflow with automatic iterative quality improvement.
   *
   * This method generates an initial workflow, then iteratively refines it
   * until quality targets are met or cost limits are reached.
   *
   * Cost vs Quality Balancing:
   * - targetQualityScore: Stop when this score is reached (default: 80)
   * - maxIterations: Maximum refinement attempts (default: 3)
   * - minImprovementThreshold: Stop if improvement per iteration drops below this (default: 5)
   * - maxTotalCostCents: Budget cap for iterations (default: 25)
   *
   * @param request - The generation request with description and constraints
   * @param qualityConfig - Optional configuration for quality improvement loop
   * @returns The improved workflow with quality metrics and iteration details
   */
  async generateWorkflowWithQualityLoop(
    request: AIWorkflowGenerationRequest,
    qualityConfig?: Partial<QualityImprovementConfig>,
  ): Promise<{
    workflow: AIGeneratedWorkflow;
    qualityScore: QualityScore;
    improvement: ImprovementResult;
  }> {
    return this.generationService.generateWorkflowWithQualityLoop(request, qualityConfig);
  }
  /**
   * Suggest improvements to an existing workflow
   */
  async suggestWorkflowImprovements(
    request: AIWorkflowSuggestionRequest,
    existingWorkflow: {
      pages: unknown[];
      logicRules?: unknown[];
      transformBlocks?: unknown[];
    },
  ): Promise<AIWorkflowSuggestion> {
    return this.suggestionService.suggestWorkflowImprovements(request, existingWorkflow);
  }
  /**
   * Suggest template variable bindings
   * @param request - The binding request
   * @param variables - Available workflow variables
   * @param placeholders - Template placeholders to match
   * @param workflow - Optional workflow structure for alias validation
   */
  async suggestTemplateBindings(
    request: AITemplateBindingsRequest,
    variables: Array<{ alias: string; label: string; type: string }>,
    placeholders: string[],
    workflow?: WorkflowWithAliases,
  ): Promise<AITemplateBindingsResponse> {
    return this.suggestionService.suggestTemplateBindings(request, variables, placeholders, workflow);
  }
  /**
   * Suggest random plausible values for workflow steps
   */
  async suggestValues(
    steps: Array<{
      key: string;
      type: string;
      label?: string;
      choices?: string[];
      options?: string[];
      description?: string;
    }>,
    mode: 'full' | 'partial' = 'full'
  ): Promise<Record<string, unknown>> {
    return this.suggestionService.suggestValues(steps, mode);
  }
  /**
   * Generate logic connections based on natural language description
   */
  async generateLogic(
    request: AIConnectLogicRequest,
  ): Promise<AIConnectLogicResponse> {
    return this.logicService.generateLogic(request);
  }
  /**
   * Visualize logic as a graph
   */
  async visualizeLogic(
    request: AIVisualizeLogicRequest,
  ): Promise<AIVisualizeLogicResponse> {
    return this.logicService.visualizeLogic(request);
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
      return 'claude-sonnet-5';
    case 'gemini':
      return 'gemini-2.0-flash';
    default:
      throw new Error(`Unknown provider: ${provider as string}`);
  }
}
/**
 * Create AIService instance from environment variables.
 *
 * @param tenantId Optional tenant to bill/budget the resulting calls to
 * (ICW2-B7). Passed through to `AIProviderClient` via the config; omitted by
 * any caller not yet updated to supply it, which keeps that caller's flows
 * running with no budget enforcement — the same as before this ticket.
 */
export function createAIServiceFromEnv(tenantId?: string): AIService {
  // Check for GEMINI_API_KEY first
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
    logger.info({ provider: 'gemini', model }, 'AI Service initialized');
    const config: AIProviderConfig = {
      provider: 'gemini' as AIProvider,
      apiKey: geminiKey,
      model,
      temperature: 0.7,
      maxTokens: 4000,
      tenantId,
    };
    return new AIService(config);
  }
  // Fall back to AI_API_KEY
  const provider = (process.env.AI_PROVIDER ?? 'openai') as AIProvider;
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
  const modelWorkflow = process.env.AI_MODEL_WORKFLOW ?? getDefaultModel(provider);
  logger.info({ provider, model: modelWorkflow }, 'AI Service initialized');
  const config: AIProviderConfig = {
    provider,
    apiKey,
    model: modelWorkflow,
    temperature: 0.7,
    maxTokens: 4000,
    tenantId,
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
      const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
      const error = getUnregisteredModelError('gemini', model);
      return { configured: true, provider: 'gemini', model, error };
    }
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) {
      return {
        configured: false,
        error: 'No API key configured. Set GEMINI_API_KEY or AI_API_KEY environment variable.'
      };
    }
    const provider = (process.env.AI_PROVIDER ?? 'openai') as AIProvider;
    const model = process.env.AI_MODEL_WORKFLOW ?? getDefaultModel(provider);
    const error = getUnregisteredModelError(provider, model);
    return { configured: true, provider, model, error };
  } catch (error: unknown) {
    return { configured: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

function getUnregisteredModelError(provider: AIProvider, model: string): string | undefined {
  if (ModelRegistry.isRegistered(provider, model)) {
    return undefined;
  }

  const registeredModels = ModelRegistry.getModelsForProvider(provider);
  const error = `AI model "${model}" is not registered for provider "${provider}". Registered models: ${registeredModels.join(', ') || '(none)'}.`;

  logger.warn(
    { provider, model, registeredModels },
    'AI model is not registered; continuing with the ModelRegistry fallback configuration',
  );

  return error;
}
