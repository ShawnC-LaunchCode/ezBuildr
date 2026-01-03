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
 * Legacy Validation Rule (JSON-based)
 */
export type LegacyValidateRule = {
  when?: WhenCondition;               // Optional condition - if omitted, always applies
  assert: AssertExpression;           // Assertion to validate
  message: string;                    // Error message if validation fails
};

/**
 * Compare Rule (Visual Builder)
 * Compares two values (variable vs variable or variable vs constant)
 */
export type CompareRule = {
  type: 'compare';
  left: string;                       // Variable reference
  op: ComparisonOperator;             // 'equals', 'greater_than', etc.
  right: any;                         // Variable reference or constant value
  rightType: 'variable' | 'constant'; // How to interpret 'right'
  message: string;
};

/**
 * Conditional Required Rule (Visual Builder)
 * If condition is met, require specific fields
 */
export type ConditionalRequiredRule = {
  type: 'conditional_required';
  when: WhenCondition;                // Condition to evaluate (e.g. married == true)
  requiredFields: string[];           // List of step aliases/IDs to require
  message: string;
};

/**
 * For Each Rule (Visual Builder)
 * Iterates a list and applies validation to items
 */
export type ForEachRule = {
  type: 'foreach';
  listKey: string;                    // List variable to iterate
  itemAlias: string;                  // Alias for the current item in loop (e.g. "child")
  rules: ValidateRule[];              // Inner rules applied to items
  message?: string;                   // Optional fallback message
};

/**
 * Validation Rule Union
 */
export type ValidateRule =
  | LegacyValidateRule
  | CompareRule
  | ConditionalRequiredRule
  | ForEachRule;

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
  recordIdValue?: string;             // Deprecated? No, usually we just used recordIdKey.
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
 * Match Strategy for Upsert
 * Determines how to find existing rows
 */
export type MatchStrategy = {
  type: "primary_key" | "column_match";
  columnId?: string;     // Required when type = "column_match"
  columnValue?: string;  // Variable reference for the match value
};

/**
 * Write Block Configuration
 * Writes data to a native table with upsert support
 */
export type WriteBlockConfig = {
  dataSourceId: string;
  tableId: string;
  mode: "create" | "update" | "upsert";
  matchStrategy?: MatchStrategy;      // Required for update and upsert modes
  primaryKeyColumnId?: string;        // Deprecated - use matchStrategy instead
  primaryKeyValue?: string;           // Deprecated - use matchStrategy instead
  columnMappings: ColumnMapping[];
  runCondition?: WhenCondition;
  outputKey?: string;                 // Step alias to store the row ID
};

/**
 * Write Execution Result
 */
export interface WriteResult {
  success: boolean;
  tableId: string;
  rowId?: string;
  writtenColumnIds: string[];
  operation: "create" | "update" | "upsert";
  writtenData?: Record<string, any>; // For debugging/logs
  error?: string;
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
 * Filter operators for ReadTable block and List Tools
 */
export type ReadTableOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "gte"
  | "less_than"
  | "lte"
  | "is_empty"
  | "is_not_empty"
  | "in_list"
  | "not_in_list"
  | "exists"
  | "in"; // Legacy alias for in_list

/**
 * Filter condition for ReadTable block
 */
export type ReadTableFilter = {
  columnId: string;              // Column UUID to filter on
  operator: ReadTableOperator;   // Comparison operator
  value?: any;                   // Filter value (can be static or variable reference)
};

/**
 * Sort configuration for ReadTable block
 */
export type ReadTableSort = {
  columnId: string;              // Column UUID to sort by
  direction: "asc" | "desc";     // Sort direction
};

/**
 * Read Table Block Configuration
 * Reads data from a DataVault table and outputs a List
 */
export type ReadTableConfig = {
  dataSourceId: string;          // Database/data source ID
  tableId: string;               // Table ID to read from
  filters?: ReadTableFilter[];   // Optional filter conditions (Easy: 0-1, Advanced: multiple)
  sort?: ReadTableSort;          // Optional sort configuration
  limit?: number;                // Row limit (default: 100, Easy: hidden, Advanced: configurable)
  columns?: string[] | null;     // Optional specific columns to select (null/undefined = all)
  outputKey: string;             // Variable name to store the result list
  runCondition?: WhenCondition;  // Optional condition to run this block
  totalColumnCount?: number;     // Total columns available (for display purposes)
};

/**
 * Read Table Execution Result
 */
export interface ReadTableResult {
  success: boolean;
  tableId: string;
  rows: Array<Record<string, any>>; // Array of row objects (columnId -> value)
  count: number;                    // Number of rows returned
  columns?: Array<{                 // Column metadata for reference
    id: string;
    name: string;
    type: string;
  }>;
  error?: string;
}

/**
 * Standardized List Variable Structure
 * Consistent shape for all list outputs across the platform
 */
export interface ListVariable {
  metadata: {
    source: 'read_table' | 'query' | 'list_tools'; // Where this list came from
    sourceId?: string;                              // ID of source table/query/block
    tableName?: string;                             // Human-readable table name
    queryName?: string;                             // Human-readable query name
    queryParams?: Record<string, any>;              // Original query parameters
    filteredBy?: string[];                          // Column IDs used in filters
    sortedBy?: { columnId: string; direction: 'asc' | 'desc' }; // Sort configuration
  };
  rows: Array<{
    id: string;                                     // Row ID
    [columnId: string]: any;                        // Column data (columnId -> value)
  }>;
  count: number;                                    // Number of rows in this list
  columns: Array<{                                  // Column metadata
    id: string;                                     // Column UUID
    name: string;                                   // Display name
    type: string;                                   // Column type
  }>;
}

/**
 * List Tools Filter Rule
 * Single filter condition for list filtering
 */
export type ListToolsFilterRule = {
  fieldPath: string;                 // Dot-notation path to field (e.g., "name", "address.zip", "child.age")
  op: ReadTableOperator;             // Comparison operator
  valueSource: "const" | "var";      // Whether value is a constant or variable reference
  value?: any;                       // Filter value (constant or variable name)
};

/**
 * List Tools Filter Group
 * Supports AND/OR combinators with nested groups
 */
export type ListToolsFilterGroup = {
  combinator: "and" | "or";          // How to combine rules/groups
  rules?: ListToolsFilterRule[];     // Filter rules in this group
  groups?: ListToolsFilterGroup[];   // Nested groups (for advanced mode)
};

/**
 * List Tools Sort Key
 * Single sort key configuration
 */
export type ListToolsSortKey = {
  fieldPath: string;                 // Dot-notation path to field
  direction: "asc" | "desc";         // Sort direction
};

/**
 * List Tools Dedupe Configuration
 */
export type ListToolsDedupe = {
  fieldPath: string;                 // Field to dedupe by
};

/**
 * List Tools Output Configuration
 * Derived outputs from the list transformation
 */
export type ListToolsOutputs = {
  countVar?: string;                 // Variable to store count
  firstVar?: string;                 // Variable to store first row
};

/**
 * Comprehensive List Tools Block Configuration
 * Applies multiple operations in sequence: filter → sort → offset/limit → select → dedupe
 */
export type ListToolsConfig = {
  sourceListVar: string;             // Input list variable name
  outputListVar: string;             // Output list variable name

  // Operations (applied in order)
  filters?: ListToolsFilterGroup;    // Filter configuration (AND/OR groups)
  sort?: ListToolsSortKey[];         // Multi-key sorting (applied in order)
  limit?: number;                    // Row limit
  offset?: number;                   // Row offset (skip first N rows)
  select?: string[];                 // Field paths to project (if omitted, all fields included)
  dedupe?: ListToolsDedupe;          // Deduplication configuration
  outputs?: ListToolsOutputs;        // Derived outputs (count, first row)

  runCondition?: WhenCondition;      // Optional condition to run block
};

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
  | { type: "read_table"; phase: BlockPhase; config: ReadTableConfig; sectionId?: string | null }
  | { type: "write"; phase: BlockPhase; config: WriteBlockConfig; sectionId?: string | null }
  | { type: "external_send"; phase: BlockPhase; config: ExternalSendBlockConfig; sectionId?: string | null }
  | { type: "list_tools"; phase: BlockPhase; config: ListToolsConfig; sectionId?: string | null };

/**
 * Block execution context
 * Provides runtime context to block runners
 */
export interface BlockContext {
  workflowId: string;
  runId?: string;
  sectionId?: string;
  phase: BlockPhase;
  data: Record<string, any>;          // Current step values (stepId -> value)
  queryParams?: Record<string, any>;  // Query parameters (for prefill blocks)
  mode?: 'preview' | 'live'; // Added execution mode
  aliasMap?: Record<string, string>; // Map of alias -> stepId
  versionId?: string; // Workflow version ID
  userId?: string; // User ID of the person executing the workflow (if authenticated)
}

/**
 * Block execution result
 * Returned by block runners after execution
 */
export interface BlockResult {
  success: boolean;
  data?: Record<string, any>;         // Updated data (for prefill blocks)
  errors?: string[];                  // General validation errors
  fieldErrors?: Record<string, string[]>; // Field-specific validation errors (stepId -> errors)
  nextSectionId?: string;             // Next section decision (for branch blocks)
}
