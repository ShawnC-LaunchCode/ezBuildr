/**
 * Shared types for AI services
 */

export type { AIGeneratedWorkflow, AIGeneratedStep, AIGeneratedSection, AIGeneratedLogicRule, AIGeneratedTransformBlock } from '../../../shared/types/ai';

/**
 * Valid step types from database schema
 */
export const VALID_STEP_TYPES = [
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
export const TYPE_ALIASES: Record<string, string> = {
  'checkbox': 'multiple_choice',
  'select': 'choice',
  'dropdown': 'choice',
  'textarea': 'long_text',
  'input': 'short_text',
};

/**
 * Error codes for AI service errors
 */
export type AIErrorCode =
  | 'INVALID_RESPONSE'
  | 'API_ERROR'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'RESPONSE_TRUNCATED';

/**
 * Task types for LLM calls
 */
export type TaskType =
  | 'workflow_generation'
  | 'workflow_suggestion'
  | 'binding_suggestion'
  | 'value_suggestion'
  | 'workflow_revision'
  | 'logic_generation'
  | 'logic_debug'
  | 'logic_visualization';

/**
 * Token estimation utilities
 */
export interface TokenEstimate {
  promptTokens: number;
  maxResponseTokens: number;
  totalTokens: number;
  maxContext: number;
}

/**
 * Cost estimation for AI API calls
 */
export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

/**
 * Truncation detection result
 */
export interface TruncationCheck {
  isTruncated: boolean;
  reason?: string;
  lastChars?: string;
}
