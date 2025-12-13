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
 * Create Record Block Configuration
 * Creates a new record in a collection
 */
export type CreateRecordConfig = {
  collectionId: string;               // Collection to create record in
  fieldMap: Record<string, string>;   // Map of fieldSlug -> stepAlias (where to get the value from)
  outputKey?: string;                 // Step alias to store the created record ID (optional)
};

/**
 * Update Record Block Configuration
 * Updates an existing record in a collection
 */
export type UpdateRecordConfig = {
  collectionId: string;               // Collection containing the record
  recordIdKey: string;                // Step alias containing the record ID to update
  fieldMap: Record<string, string>;   // Map of fieldSlug -> stepAlias (values to update)
};

/**
 * Find Record Block Configuration
 * Queries records and returns matches
 */
export type FindRecordConfig = {
  collectionId: string;               // Collection to query
  filters: Record<string, any>;       // Filter criteria (fieldSlug -> expected value or {op, value})
  limit?: number;                     // Max number of records to return (default: 1)
  outputKey: string;                  // Step alias to store found record(s)
  failIfNotFound?: boolean;           // Whether to fail the workflow if no records found (default: false)
};

/**
 * Delete Record Block Configuration
 * Deletes a record from a collection
 */
export type DeleteRecordConfig = {
  collectionId: string;               // Collection containing the record
  recordIdKey: string;                // Step alias containing the record ID to delete
};

/**
 * Query Block Configuration
 * Executes a saved query and outputs a ListVariable
 */
export type QueryBlockConfig = {
  queryId: string;                    // ID of the saved query to execute
  outputVariableName: string;         // Name of the output list variable
};

/**
 * Column Mapping
 * Maps a workflow value to a database column
 */
export type ColumnMapping = {
  columnId: string;
  value: string; // Expression, variable ref, or static value
};

/**
 * Write Block Configuration
 * Writes data to a native table
 */
export type WriteBlockConfig = {
  dataSourceId: string;
  tableId: string;
  mode: "create" | "update";
  primaryKeyColumnId?: string;        // Required for update mode
  primaryKeyValue?: string;           // Required for update mode
  columnMappings: ColumnMapping[];
  runCondition?: WhenCondition;
};

/**
 * Write Execution Result
 */
export interface WriteResult {
  success: boolean;
  tableId: string;
  rowId?: string;
  writtenColumnIds: string[];
  operation: "create" | "update";
}

/**
 * External Destination Model
 */
export interface ExternalDestination {
  id: string;
  workspaceId: string;
  type: "webhook" | "google_sheets" | "airtable" | "zapier" | "make";
  name: string;
  config: Record<string, any>;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/**
 * Payload Key-Value Mapping
 */
export type PayloadMapping = {
  key: string;
  value: string; // Expression or static value
};

/**
 * Header Mapping
 */
export type HeaderMapping = {
  key: string;
  value: string;
};

/**
 * External Send Block Configuration
 */
export type ExternalSendBlockConfig = {
  destinationId: string;
  payloadMappings: PayloadMapping[];
  headers?: HeaderMapping[];
  runCondition?: WhenCondition;
};

/**
 * External Send Execution Result
 */
export interface ExternalSendResult {
  success: boolean;
  destinationId: string;
  statusCode?: number;
  responseSnippet?: string;
  error?: string;
}

/**
 * Discriminated union of block kinds
 * Each block type has its own config shape
 */
export type BlockKind =
  | { type: "prefill"; phase: BlockPhase; config: PrefillConfig; sectionId?: string | null }
  | { type: "validate"; phase: BlockPhase; config: ValidateConfig; sectionId?: string | null }
  | { type: "branch"; phase: BlockPhase; config: BranchConfig; sectionId?: string | null }
  | { type: "create_record"; phase: BlockPhase; config: CreateRecordConfig; sectionId?: string | null }
  | { type: "update_record"; phase: BlockPhase; config: UpdateRecordConfig; sectionId?: string | null }
  | { type: "find_record"; phase: BlockPhase; config: FindRecordConfig; sectionId?: string | null }
  | { type: "delete_record"; phase: BlockPhase; config: DeleteRecordConfig; sectionId?: string | null }
  | { type: "query"; phase: BlockPhase; config: QueryBlockConfig; sectionId?: string | null }
  | { type: "write"; phase: BlockPhase; config: WriteBlockConfig; sectionId?: string | null }
  | { type: "external_send"; phase: BlockPhase; config: ExternalSendBlockConfig; sectionId?: string | null };

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
