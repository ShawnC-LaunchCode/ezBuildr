/**
 * Shared types for workflow run services
 */

import type { WorkflowRun, InsertWorkflowRun } from "@shared/schema";

/**
 * Execution context for run operations
 */
export interface ExecutionContext {
  workflowId: string;
  runId: string;
  userId?: string;
  mode: 'live' | 'preview';
}

/**
 * Options for creating a run
 */
export interface CreateRunOptions {
  snapshotId?: string;
  randomize?: boolean;
  clientEmail?: string;
  accessMode?: 'anonymous' | 'token' | 'portal';
}

/**
 * Initial run data (without workflowId and runToken)
 */
export type CreateRunData = Omit<InsertWorkflowRun, 'workflowId' | 'runToken'>;

/**
 * Workflow context for metrics
 */
export interface WorkflowContext {
  tenantId: string;
  projectId: string;
}

/**
 * Snapshot value map structure
 */
export interface SnapshotValueMap {
  [key: string]: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- snapshot values have dynamic types from workflow data
    value: any;
    stepId: string;
    stepUpdatedAt: string;
  };
}

/**
 * Run completion result
 */
export interface RunCompletionResult {
  run: WorkflowRun;
  documentsGenerated: number;
  writebacksExecuted: number;
  durationMs: number;
}

/**
 * Validation result for run completion
 */
export interface ValidationResult {
  valid: boolean;
  missingSteps: string[];
  missingStepTitles?: string[];
  errors?: string[];
}

/**
 * Share token result
 */
export interface ShareTokenResult {
  shareToken: string;
  expiresAt: Date | null;
}

/**
 * Shared run details
 */
export interface SharedRunDetails {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime access settings with dynamic structure
  run: WorkflowRun & { accessSettings: any };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- document objects have varying structure
  documents: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- final block config has dynamic shape
  finalBlockConfig: any;
}

/**
 * Initial value population options
 */
export interface PopulateValuesOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- workflow step values have dynamic types
  initialValues?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- snapshot values have dynamic types
  snapshotValues?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- randomized values have dynamic types
  randomValues?: Record<string, any>;
}

/**
 * Document generation result
 */
export interface DocumentGenerationResult {
  success: boolean;
  documentsGenerated: number;
  errors?: string[];
  documents?: Array<{
    alias: string;
    filename: string;
    filePath: string;
    mimeType: string;
    size: number;
    unresolvedVariables?: string[];
    pdfStrategy?: string;
  }>;
  archive?: unknown;
  skipped?: string[];
  failed?: unknown[];
  isArchived?: boolean;
}

/**
 * Writeback execution result
 */
export interface WritebackExecutionResult {
  success: boolean;
  rowsCreated: number;
  errors: string[];
}
