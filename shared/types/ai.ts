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
    // Legacy / Existing Types
    'short_text',
    'long_text',
    'multiple_choice',
    'radio',
    'checkbox', // Kept for AI compatibility if used, though not in DB enum explicitly? (Check usage)
    'yes_no',
    'date_time',
    'file_upload',
    'loop_group',
    'computed',
    'js_question',
    'repeater',
    'final_documents',
    'signature_block',

    // Easy Mode Types
    'true_false',
    'phone',
    'date',
    'time',
    'datetime',
    'email',
    'number',
    'currency',
    'scale',
    'website',
    'display',
    'address',
    'final',

    // Advanced Mode Types
    'text',
    'boolean',
    'phone_advanced',
    'datetime_unified',
    'choice',
    'email_advanced',
    'number_advanced',
    'scale_advanced',
    'website_advanced',
    'address_advanced',
    'multi_field',
    'display_advanced'
  ]).describe('Step type (question type)'),
  title: z.string().min(1).describe('Step title/question text'),
  description: z.string().nullable().optional().describe('Optional step description'),
  alias: z.string().nullable().optional().describe('Human-friendly variable name for this step'),
  required: z.boolean().default(false).describe('Whether this step is required'),
  config: z.record(z.any()).nullable().optional().describe('Type-specific configuration (choices, validation, etc)'),
  visibleIf: z.any().describe('Condition expression for visibility (string or object)'),
  order: z.number().int().optional().describe('Display order'),
  defaultValue: z.any().optional().describe('Default value'),
});

export type AIGeneratedStep = z.infer<typeof AIGeneratedStepSchema>;

/**
 * AI-generated section (page) specification
 */
export const AIGeneratedSectionSchema = z.object({
  id: z.string().describe('Unique identifier for the section'),
  title: z.string().min(1).describe('Section title'),
  description: z.string().nullable().optional().describe('Optional section description'),
  order: z.number().int().min(0).describe('Display order of this section'),
  steps: z.array(AIGeneratedStepSchema).describe('Steps within this section'),
});

export type AIGeneratedSection = z.infer<typeof AIGeneratedSectionSchema>;

/**
 * AI-generated logic rule specification
 */
export const AIGeneratedLogicRuleSchema = z.object({
  id: z.string().describe('Unique identifier for the logic rule'),
  conditionStepAlias: z.string().optional().describe('Step alias to check condition on'),
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
  targetAlias: z.string().optional().describe('Alias of the target section/step'),
  action: z.enum(['show', 'hide', 'require', 'make_optional', 'skip_to']).describe('Action to perform when condition is met'),
  description: z.string().nullable().optional().describe('Human-readable description of what this rule does'),
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
  title: z.string().min(1).describe('Workflow title'),
  description: z.string().nullable().optional().describe('Workflow description'),
  sections: z.array(AIGeneratedSectionSchema).default([]).describe('Workflow sections (pages)'),
  logicRules: z.array(AIGeneratedLogicRuleSchema).default([]).describe('Conditional logic rules'),
  transformBlocks: z.array(AIGeneratedTransformBlockSchema).default([]).describe('JavaScript/Python computation blocks'),
  notes: z.string().nullable().optional().describe('Additional notes from the AI about this workflow'),
});

export type AIGeneratedWorkflow = z.infer<typeof AIGeneratedWorkflowSchema>;

/**
 * Default minimum quality score for workflow generation
 * Can be overridden via environment variable AI_MIN_QUALITY_SCORE
 */
export const DEFAULT_MIN_QUALITY_SCORE = 60;

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
  minQualityScore: z.number().int().min(0).max(100).optional().describe(
    'Minimum quality score threshold (0-100). Workflows below this score will be rejected. ' +
    'Defaults to AI_MIN_QUALITY_SCORE env var or 60.'
  ),
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
  warnings: z.array(z.string()).default([]).describe('Warnings about filtered or invalid bindings'),
});

export type AITemplateBindingsResponse = z.infer<typeof AITemplateBindingsResponseSchema>;

/**
 * AI provider configuration
 */
export type AIProvider = 'openai' | 'anthropic' | 'gemini';

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

/**
 * Quality Score Types
 */
export const QualityScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  breakdown: z.object({
    aliases: z.number(),
    types: z.number(),
    structure: z.number(),
    ux: z.number(),
    completeness: z.number(),
    validation: z.number(),
  }),
  issues: z.array(z.object({
    category: z.string(),
    severity: z.enum(['error', 'warning', 'suggestion']),
    message: z.string(),
    stepAlias: z.string().optional(),
  })),
  passed: z.boolean(),
  suggestions: z.array(z.string()),
});

export type QualityScore = z.infer<typeof QualityScoreSchema>;

/**
 * AI Workflow Revision Types
 */

export const WorkflowChangeSchema = z.object({
  type: z.enum(['add', 'remove', 'update', 'move']).describe('Type of change'),
  target: z.string().describe('Path to the target element (e.g., sections[0].steps[1])'),
  before: z.any().optional().describe('Value before change (for updates/removes)'),
  after: z.any().optional().describe('Value after change (for updates/adds)'),
  explanation: z.string().optional().describe('Human-readable explanation of this specific change'),
});

export type WorkflowChange = z.infer<typeof WorkflowChangeSchema>;

export const WorkflowDiffSchema = z.object({
  changes: z.array(WorkflowChangeSchema).describe('List of changes applied'),
});

export type WorkflowDiff = z.infer<typeof WorkflowDiffSchema>;

export const AIWorkflowRevisionRequestSchema = z.object({
  workflowId: z.string().uuid().describe('ID of the workflow being revised'),
  currentWorkflow: AIGeneratedWorkflowSchema.describe('Current state of the workflow JSON'),
  userInstruction: z.string().min(1).describe('User instruction for revision'),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional().describe('Previous conversation context'),
  mode: z.enum(['easy', 'advanced']).default('easy').describe('Current builder mode'),
});

export type AIWorkflowRevisionRequest = z.infer<typeof AIWorkflowRevisionRequestSchema>;

export const AIWorkflowRevisionResponseSchema = z.object({
  updatedWorkflow: AIGeneratedWorkflowSchema.describe('The revised workflow JSON'),
  diff: WorkflowDiffSchema.describe('Structured diff of changes'),
  explanation: z.array(z.string()).optional().describe('High-level explanation of what was done'),
  suggestions: z.array(z.string()).optional().describe('Follow-up suggestions'),
  quality: QualityScoreSchema.optional().describe('Quality assessment of the revision'),
  metadata: z.object({
    applied: z.boolean().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
  }).optional().describe('Execution metadata'),
});

export type AIWorkflowRevisionResponse = z.infer<typeof AIWorkflowRevisionResponseSchema>;

/**
 * AI Logic Generation Types
 */

export const AIConnectLogicRequestSchema = z.object({
  workflowId: z.string().uuid(),
  currentWorkflow: AIGeneratedWorkflowSchema,
  description: z.string().min(1).describe("Description of the logic rules to generate"),
  mode: z.enum(['easy', 'advanced']).default('easy'),
});

export type AIConnectLogicRequest = z.infer<typeof AIConnectLogicRequestSchema>;

export const AIConnectLogicResponseSchema = z.object({
  updatedWorkflow: AIGeneratedWorkflowSchema,
  diff: WorkflowDiffSchema,
  explanation: z.array(z.string()),
  suggestions: z.array(z.string()).optional(),
});

export type AIConnectLogicResponse = z.infer<typeof AIConnectLogicResponseSchema>;

/**
 * AI Logic Debugging Types
 */

export const LogicIssueSchema = z.object({
  id: z.string(),
  type: z.enum(['contradiction', 'unreachable', 'cycle', 'unused_variable', 'dead_block', 'redundant', 'ambiguous']),
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  locations: z.array(z.string()).describe('IDs of elements involved'),
});

export type LogicIssue = z.infer<typeof LogicIssueSchema>;

export const LogicFixSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  description: z.string(),
  action: z.string(), // Description of action
  // In a real implementation this might include specific patch data
});

export type LogicFix = z.infer<typeof LogicFixSchema>;

export const LogicGraphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['section', 'step', 'start', 'end']),
  unreachable: z.boolean().optional(),
});

export const LogicGraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  condition: z.string().optional(), // Stringified condition
  contradictory: z.boolean().optional(),
});

export const LogicGraphSchema = z.object({
  nodes: z.array(LogicGraphNodeSchema),
  edges: z.array(LogicGraphEdgeSchema),
});

export type LogicGraph = z.infer<typeof LogicGraphSchema>;

export const AIDebugLogicRequestSchema = z.object({
  workflowId: z.string().uuid(),
  currentWorkflow: AIGeneratedWorkflowSchema,
});

export type AIDebugLogicRequest = z.infer<typeof AIDebugLogicRequestSchema>;

export const AIDebugLogicResponseSchema = z.object({
  issues: z.array(LogicIssueSchema),
  recommendedFixes: z.array(LogicFixSchema),
  visualization: LogicGraphSchema,
});

export type AIDebugLogicResponse = z.infer<typeof AIDebugLogicResponseSchema>;

export const AIVisualizeLogicRequestSchema = z.object({
  workflowId: z.string().uuid(),
  currentWorkflow: AIGeneratedWorkflowSchema,
});

export type AIVisualizeLogicRequest = z.infer<typeof AIVisualizeLogicRequestSchema>;

export const AIVisualizeLogicResponseSchema = z.object({
  graph: LogicGraphSchema,
});

export type AIVisualizeLogicResponse = z.infer<typeof AIVisualizeLogicResponseSchema>;
