/**
 * AI Service Facade
 *
 * This service acts as a unified entry point for all AI capabilities,
 * delegating actual work to specialized services.
 *
 * Features:
 * - Workflow Generation (via WorkflowGenerationService)
 * - Workflow Suggestions (via WorkflowSuggestionService)
 * - Workflow Revision (via WorkflowRevisionService)
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
  AIWorkflowRevisionRequest,
  AIWorkflowRevisionResponse,
  AIConnectLogicRequest,
  AIConnectLogicResponse,
  AIDebugLogicRequest,
  AIDebugLogicResponse,
  AIVisualizeLogicRequest,
  AIVisualizeLogicResponse,
} from '../../shared/types/ai';
import { createLogger } from '../logger';
import { AIPromptBuilder } from './ai/AIPromptBuilder';
import { AIProviderClient } from './ai/AIProviderClient';
import { WorkflowGenerationService } from './ai/WorkflowGenerationService';
import { WorkflowLogicService } from './ai/WorkflowLogicService';
import { workflowOptimizationService, WorkflowOptimizationService } from './ai/WorkflowOptimizationService';
import { WorkflowRevisionService } from './ai/WorkflowRevisionService';
import { WorkflowSuggestionService } from './ai/WorkflowSuggestionService';
const logger = createLogger({ module: 'ai-service' });
/**
 * AI Service for workflow generation and suggestions
 */
export class AIService {
  private generationService: WorkflowGenerationService;
  private suggestionService: WorkflowSuggestionService;
  private revisionService: WorkflowRevisionService;
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
    this.revisionService = new WorkflowRevisionService(client, promptBuilder);
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
    return this.suggestionService.suggestWorkflowImprovements(request, existingWorkflow);
  }
  /**
   * Suggest template variable bindings
   */
  async suggestTemplateBindings(
    request: AITemplateBindingsRequest,
    variables: Array<{ alias: string; label: string; type: string }>,
    placeholders: string[],
  ): Promise<AITemplateBindingsResponse> {
    return this.suggestionService.suggestTemplateBindings(request, variables, placeholders);
  }
  /**
   * Suggest random plausible values for workflow steps
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
    return this.suggestionService.suggestValues(steps, mode);
  }
  /**
   * Revise an existing workflow based on user instructions
   */
  async reviseWorkflow(
    request: AIWorkflowRevisionRequest,
  ): Promise<AIWorkflowRevisionResponse> {
    return this.revisionService.reviseWorkflow(request);
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
   * Debug logic for contradictions and issues
   */
  async debugLogic(
    request: AIDebugLogicRequest,
  ): Promise<AIDebugLogicResponse> {
    return this.logicService.debugLogic(request);
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
      return 'claude-3-5-sonnet-20241022';
    case 'gemini':
      return 'gemini-2.0-flash';
    default:
      throw new Error(`Unknown provider: ${provider}`);
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