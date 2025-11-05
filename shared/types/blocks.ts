/**
 * Block Framework Type Definitions
 *
 * This module provides type-safe definitions for the generic Block Framework,
 * supporting multiple block types (prefill, validate, branch) that execute at
 * different workflow runtime phases.
 */

/**
 * Block execution phases in workflow lifecycle
 */
export type BlockPhase =
  | "onRunStart"       // Run creation
  | "onSectionEnter"   // When entering a section
  | "onSectionSubmit"  // When submitting a section's values
  | "onNext"           // When navigating to next section
  | "onRunComplete";   // When completing the run

/**
 * Prefill Block Configuration
 * Seeds data with static values or whitelisted query parameters
 */
export type PrefillConfig = {
  mode: "static" | "query";
  staticMap?: Record<string, any>;     // For mode=static: key-value pairs to inject
  queryKeys?: string[];                // For mode=query: whitelist of allowed param keys
  overwrite?: boolean;                 // Whether to overwrite existing values (default: false)
};

/**
 * Comparison operators for validation and branching
 */
export type ComparisonOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "is_empty"
  | "is_not_empty";

/**
 * Assertion operators for validation rules
 */
export type AssertionOperator =
  | "is_not_empty"
  | "greater_than"
  | "less_than"
  | "equals"
  | "not_equals"
  | "regex";

/**
 * Conditional expression for when clauses
 */
export type WhenCondition = {
  key: string;                        // Data key to check
  op: ComparisonOperator;             // Comparison operator
  value?: any;                        // Expected value (not needed for is_empty/is_not_empty)
};

/**
 * Assertion expression for validation
 */
export type AssertExpression = {
  key: string;                        // Data key to validate
  op: AssertionOperator;              // Assertion operator
  value?: any;                        // Expected value or regex pattern
};

/**
 * Validation Rule
 * Conditionally validates data and returns error message if assertion fails
 */
export type ValidateRule = {
  when?: WhenCondition;               // Optional condition - if omitted, always applies
  assert: AssertExpression;           // Assertion to validate
  message: string;                    // Error message if validation fails
};

/**
 * Validate Block Configuration
 * Runs validation rules and fails with error messages if any fail
 */
export type ValidateConfig = {
  rules: ValidateRule[];
};

/**
 * Branch Rule
 * Conditional navigation rule
 */
export type BranchRule = {
  when: WhenCondition;                // Condition to evaluate
  gotoSectionId: string;              // Section ID to navigate to if condition is met
};

/**
 * Branch Block Configuration
 * Chooses next section via ordered conditions (first match wins)
 */
export type BranchConfig = {
  branches: BranchRule[];             // Ordered list of branch conditions
  fallbackSectionId?: string;         // Default section if no conditions match
};

/**
 * Discriminated union of block kinds
 * Each block type has its own config shape
 */
export type BlockKind =
  | { type: "prefill"; phase: BlockPhase; config: PrefillConfig; sectionId?: string | null }
  | { type: "validate"; phase: BlockPhase; config: ValidateConfig; sectionId?: string | null }
  | { type: "branch"; phase: BlockPhase; config: BranchConfig; sectionId?: string | null };

/**
 * Block execution context
 * Provides runtime context to block runners
 */
export interface BlockContext {
  workflowId: string;
  runId: string;
  phase: BlockPhase;
  sectionId?: string;
  data: Record<string, any>;          // Current step values (stepId -> value)
  queryParams?: Record<string, any>;  // Query parameters (for prefill blocks)
}

/**
 * Block execution result
 * Returned by block runners after execution
 */
export interface BlockResult {
  success: boolean;
  data?: Record<string, any>;         // Updated data (for prefill blocks)
  errors?: string[];                  // Validation errors (for validate blocks)
  nextSectionId?: string;             // Next section decision (for branch blocks)
}
