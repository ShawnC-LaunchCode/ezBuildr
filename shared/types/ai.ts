/**
 * AI-Generated Workflow Types
 *
 * This module defines types and schemas for AI-generated workflow specifications.
 * The AI generates workflow structures that are then validated and inserted into the builder.
 */

import { z } from 'zod';

import { conditionExpressionSchema } from './conditions';

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
    'computed',
    'js_question',
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
    'datetime_unified',
    'choice',
    'number_advanced',
    'scale_advanced',
    'address_advanced',
    'multi_field',
    'display_advanced',

    // Structural Types
    'list',
  ]).describe('Step type (question type)'),
  title: z.string().min(1).describe('Step title/question text'),
  description: z.string().nullable().optional().describe('Optional step description'),
  alias: z.string().nullable().optional().describe('Human-friendly variable name for this step'),
  required: z.boolean().default(false).describe('Whether this step is required'),
  config: z.record(z.any()).nullable().optional().describe('Type-specific configuration (choices, validation, etc)'),
  // O-4: was `z.any()` described as "string or object". A string here was
  // stored as jsonb through an `as unknown as` cast, then failed evaluation
  // and fell through to `false` — silently hiding the question forever. The
  // same ConditionExpression the rest of the app uses is the only valid shape.
  visibleIf: conditionExpressionSchema.optional().describe(
    'Visibility condition: a ConditionExpression tree (nested AND/OR groups of comparisons). ' +
    'Each condition has a "variable" holding a step alias. Omit for always-visible.'
  ),
  order: z.number().int().optional().describe('Display order'),
  defaultValue: z.any().optional().describe('Default value'),
});

export type AIGeneratedStep = z.infer<typeof AIGeneratedStepSchema>;

/**
 * AI-generated page (page) specification
 */
export const AIGeneratedPageSchema = z.object({
  id: z.string().describe('Unique identifier for the page'),
  title: z.string().min(1).describe('Page title'),
  description: z.string().nullable().optional().describe('Optional page description'),
  order: z.number().int().min(0).describe('Display order of this page'),
  sectionId: z.string().nullable().optional().describe(
    'Id of the Section this page belongs to, matching a `sections[].id`. ' +
    'Omit or null for an ungrouped page. Pages sharing a Section must be ' +
    'consecutive in `order` — a Section cannot be split across other pages.'
  ),
  steps: z.array(AIGeneratedStepSchema).describe('Steps within this page'),
});

export type AIGeneratedPage = z.infer<typeof AIGeneratedPageSchema>;

/**
 * AI-generated Section: a named group over a contiguous run of pages
 * (SECT-B4). Sections are optional — a short workflow is fine flat — but a
 * long one arriving ungrouped is exactly the case the feature exists for.
 *
 * Membership lives on the page (`AIGeneratedPageSchema.sectionId`) rather than
 * as a page list here, so a page can only ever belong to one Section and the
 * two sides cannot contradict each other.
 */
export const AIGeneratedSectionSchema = z.object({
  id: z.string().describe('Unique identifier for the section, referenced by pages[].sectionId'),
  title: z.string().min(1).describe('Section title'),
  description: z.string().nullable().optional().describe('Optional section description'),
  visibleIf: conditionExpressionSchema.optional().describe(
    'Visibility condition for the whole Section: a ConditionExpression tree. Omit for always-visible.'
  ),
});

export type AIGeneratedSection = z.infer<typeof AIGeneratedSectionSchema>;

/**
 * AI-generated logic rule specification
 *
 * LU-6c: the trigger condition is `when` - the same nested `ConditionExpression`
 * tree (28 operators, AND/OR groups) that step/page `visibleIf` already
 * uses - not the old flat `conditionStepAlias`/`operator`/`conditionValue`
 * trio. `when`'s condition operands reference a step by its `alias` (just
 * like `targetAlias` references the rule's target); the ingest pipeline
 * (`WorkflowContentIngestService`) resolves both to real step/page ids.
 */
export const AIGeneratedLogicRuleSchema = z.object({
  id: z.string().describe('Unique identifier for the logic rule'),
  when: conditionExpressionSchema.describe(
    'Trigger condition: a ConditionExpression tree (nested AND/OR groups of comparisons), ' +
    'the same shape used for step/page visibility. Each condition\'s "variable" is a step alias.'
  ),
  targetType: z.enum(['page', 'step']).describe('Whether the target is a page or step'),
  targetAlias: z.string().optional().describe('Alias of the target page/step'),
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
  phase: z.enum(['onPageSubmit', 'onWorkflowComplete']).default('onWorkflowComplete').describe('When to execute this block'),
  pageId: z.string().optional().describe('Page ID if phase is onPageSubmit'),
  timeoutMs: z.number().int().min(100).max(3000).default(1000).describe('Execution timeout in milliseconds'),
});

export type AIGeneratedTransformBlock = z.infer<typeof AIGeneratedTransformBlockSchema>;

/**
 * AI-generated workflow specification
 */
export const AIGeneratedWorkflowSchema = z.object({
  title: z.string().min(1).describe('Workflow title'),
  description: z.string().nullable().optional().describe('Workflow description'),
  sections: z.array(AIGeneratedSectionSchema).default([]).describe(
    'Named groups over contiguous runs of pages. Optional; omit for a flat workflow.'
  ),
  pages: z.array(AIGeneratedPageSchema).default([]).describe('Workflow pages (pages)'),
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
    maxPages: z.number().int().min(1).max(50).default(10).optional(),
    maxStepsPerPage: z.number().int().min(1).max(20).default(10).optional(),
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
  newPages: z.array(AIGeneratedPageSchema).default([]).describe('Suggested new pages to add'),
  newLogicRules: z.array(AIGeneratedLogicRuleSchema).default([]).describe('Suggested new logic rules'),
  newTransformBlocks: z.array(AIGeneratedTransformBlockSchema).default([]).describe('Suggested new transform blocks'),
  modifications: z.array(z.object({
    type: z.enum(['page', 'step', 'logic_rule', 'transform_block']),
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
  /**
   * Tenant the call is billed/budgeted to (ICW2-B7). Optional so existing
   * unauthenticated/env-only callers keep working with no budget enforcement;
   * when present, `AIProviderClient.callLLM` records usage and enforces the
   * rolling budget for this tenant.
   */
  tenantId?: string;
}

/**
 * AI service error types
 */
export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_RESPONSE' | 'API_ERROR' | 'VALIDATION_ERROR' | 'RATE_LIMIT' | 'TIMEOUT',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  target: z.string().describe('Path to the target element (e.g., pages[0].steps[1])'),
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
 * AI Logic Visualization Types
 *
 * MAP-9 removed the AI logic *debugger* that also lived here
 * (`AIDebugLogicRequest`/`Response`, plus the `LogicIssue`/`LogicFix` schemas
 * only it used). Unreachable pages, dead ends and loop risks are now
 * detected deterministically by `analyzeWorkflowFlow`
 * (`shared/conditionGraph.ts`) and surfaced through `lintWorkflowContent`, so
 * the publish gate, the Review tab and the map all read one answer instead of
 * asking a model for a second, non-binding one. See
 * `git log -p -- tickets/WORKFLOW_MAP_TICKETS.md` (MAP-3, MAP-6, MAP-9).
 */

export const LogicGraphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(['page', 'step', 'start', 'end']),
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

export const AIVisualizeLogicRequestSchema = z.object({
  workflowId: z.string().uuid(),
  currentWorkflow: AIGeneratedWorkflowSchema,
});

export type AIVisualizeLogicRequest = z.infer<typeof AIVisualizeLogicRequestSchema>;

export const AIVisualizeLogicResponseSchema = z.object({
  graph: LogicGraphSchema,
});

export type AIVisualizeLogicResponse = z.infer<typeof AIVisualizeLogicResponseSchema>;
