/**
 * AI-Generated Workflow Types
 *
 * This module defines types and schemas for AI-generated workflow specifications.
 * The AI generates workflow structures that are then validated and inserted into the builder.
 */

import { z } from 'zod';

/**
 * AI-generated step (question/action) specification
 */
export const AIGeneratedStepSchema = z.object({
  id: z.string().describe('Unique identifier for the step'),
  type: z.enum([
    'short_text',
    'long_text',
    'multiple_choice',
    'radio',
    'checkbox',
    'yes_no',
    'date_time',
    'file_upload',
  ]).describe('Step type (question type)'),
  title: z.string().min(1).describe('Step title/question text'),
  description: z.string().optional().describe('Optional step description'),
  alias: z.string().optional().describe('Human-friendly variable name for this step'),
  required: z.boolean().default(false).describe('Whether this step is required'),
  config: z.record(z.any()).optional().describe('Type-specific configuration (choices, validation, etc)'),
});

export type AIGeneratedStep = z.infer<typeof AIGeneratedStepSchema>;

/**
 * AI-generated section (page) specification
 */
export const AIGeneratedSectionSchema = z.object({
  id: z.string().describe('Unique identifier for the section'),
  title: z.string().min(1).describe('Section title'),
  description: z.string().optional().describe('Optional section description'),
  order: z.number().int().min(0).describe('Display order of this section'),
  steps: z.array(AIGeneratedStepSchema).describe('Steps within this section'),
});

export type AIGeneratedSection = z.infer<typeof AIGeneratedSectionSchema>;

/**
 * AI-generated logic rule specification
 */
export const AIGeneratedLogicRuleSchema = z.object({
  id: z.string().describe('Unique identifier for the logic rule'),
  conditionStepAlias: z.string().describe('Step alias to check condition on'),
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'greater_than',
    'less_than',
    'between',
    'is_empty',
    'is_not_empty',
  ]).describe('Comparison operator'),
  conditionValue: z.any().describe('Value to compare against'),
  targetType: z.enum(['section', 'step']).describe('Whether the target is a section or step'),
  targetAlias: z.string().describe('Alias of the target section/step'),
  action: z.enum(['show', 'hide', 'require', 'make_optional', 'skip_to']).describe('Action to perform when condition is met'),
  description: z.string().optional().describe('Human-readable description of what this rule does'),
});

export type AIGeneratedLogicRule = z.infer<typeof AIGeneratedLogicRuleSchema>;

/**
 * AI-generated transform block (JavaScript/Python computation)
 */
export const AIGeneratedTransformBlockSchema = z.object({
  id: z.string().describe('Unique identifier for the transform block'),
  name: z.string().min(1).describe('Name/title of the transform block'),
  language: z.enum(['javascript', 'python']).describe('Programming language'),
  code: z.string().min(1).describe('Code to execute'),
  inputKeys: z.array(z.string()).describe('Step aliases to use as inputs'),
  outputKey: z.string().describe('Variable name for the output'),
  phase: z.enum(['onSectionSubmit', 'onWorkflowComplete']).default('onWorkflowComplete').describe('When to execute this block'),
  sectionId: z.string().optional().describe('Section ID if phase is onSectionSubmit'),
  timeoutMs: z.number().int().min(100).max(3000).default(1000).describe('Execution timeout in milliseconds'),
});

export type AIGeneratedTransformBlock = z.infer<typeof AIGeneratedTransformBlockSchema>;

/**
 * AI-generated workflow specification
 */
export const AIGeneratedWorkflowSchema = z.object({
  name: z.string().min(1).describe('Workflow name'),
  description: z.string().optional().describe('Workflow description'),
  sections: z.array(AIGeneratedSectionSchema).min(1).describe('Workflow sections (pages)'),
  logicRules: z.array(AIGeneratedLogicRuleSchema).default([]).describe('Conditional logic rules'),
  transformBlocks: z.array(AIGeneratedTransformBlockSchema).default([]).describe('JavaScript/Python computation blocks'),
  notes: z.string().optional().describe('Additional notes from the AI about this workflow'),
});

export type AIGeneratedWorkflow = z.infer<typeof AIGeneratedWorkflowSchema>;

/**
 * AI workflow generation request
 */
export const AIWorkflowGenerationRequestSchema = z.object({
  description: z.string().min(10).describe('Natural language description of the workflow to generate'),
  projectId: z.string().uuid().describe('Project ID where the workflow will be created'),
  placeholders: z.array(z.string()).optional().describe('Optional DOCX template placeholders to consider'),
  constraints: z.object({
    maxSections: z.number().int().min(1).max(50).default(10).optional(),
    maxStepsPerSection: z.number().int().min(1).max(20).default(10).optional(),
    preferredStepTypes: z.array(z.string()).optional(),
  }).optional().describe('Optional constraints for workflow generation'),
});

export type AIWorkflowGenerationRequest = z.infer<typeof AIWorkflowGenerationRequestSchema>;

/**
 * AI workflow suggestion request (for existing workflows)
 */
export const AIWorkflowSuggestionRequestSchema = z.object({
  description: z.string().min(10).describe('Natural language description of what to add/improve'),
  workflowId: z.string().uuid().describe('Existing workflow ID to enhance'),
});

export type AIWorkflowSuggestionRequest = z.infer<typeof AIWorkflowSuggestionRequestSchema>;

/**
 * AI workflow suggestion response
 */
export const AIWorkflowSuggestionSchema = z.object({
  newSections: z.array(AIGeneratedSectionSchema).default([]).describe('Suggested new sections to add'),
  newLogicRules: z.array(AIGeneratedLogicRuleSchema).default([]).describe('Suggested new logic rules'),
  newTransformBlocks: z.array(AIGeneratedTransformBlockSchema).default([]).describe('Suggested new transform blocks'),
  modifications: z.array(z.object({
    type: z.enum(['section', 'step', 'logic_rule', 'transform_block']),
    id: z.string(),
    changes: z.record(z.any()),
    reason: z.string(),
  })).default([]).describe('Suggested modifications to existing elements'),
  notes: z.string().optional().describe('Additional notes from the AI'),
});

export type AIWorkflowSuggestion = z.infer<typeof AIWorkflowSuggestionSchema>;

/**
 * AI template binding suggestion
 */
export const AIBindingSuggestionSchema = z.object({
  placeholder: z.string().describe('DOCX template placeholder (e.g., "client_name")'),
  variable: z.string().describe('Suggested workflow variable/alias (e.g., "clientName")'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  rationale: z.string().optional().describe('Why this binding is suggested'),
});

export type AIBindingSuggestion = z.infer<typeof AIBindingSuggestionSchema>;

/**
 * AI template bindings request
 */
export const AITemplateBindingsRequestSchema = z.object({
  workflowId: z.string().uuid().describe('Workflow ID to get variables from'),
  templateId: z.string().uuid().optional().describe('Template ID to get placeholders from'),
  placeholders: z.array(z.string()).optional().describe('Or provide placeholders directly'),
});

export type AITemplateBindingsRequest = z.infer<typeof AITemplateBindingsRequestSchema>;

/**
 * AI template bindings response
 */
export const AITemplateBindingsResponseSchema = z.object({
  suggestions: z.array(AIBindingSuggestionSchema).describe('Suggested variable bindings'),
  unmatchedPlaceholders: z.array(z.string()).default([]).describe('Placeholders with no good match'),
  unmatchedVariables: z.array(z.string()).default([]).describe('Variables not used in any binding'),
});

export type AITemplateBindingsResponse = z.infer<typeof AITemplateBindingsResponseSchema>;

/**
 * AI provider configuration
 */
export type AIProvider = 'openai' | 'anthropic';

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * AI service error types
 */
export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_RESPONSE' | 'API_ERROR' | 'VALIDATION_ERROR' | 'RATE_LIMIT' | 'TIMEOUT',
    public readonly details?: any,
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}
