/**
 * Shared types for workflow run services
 */

import type { WorkflowRun, InsertWorkflowRun, InsertStepValue } from "@shared/schema";

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
  run: WorkflowRun & { accessSettings: any };
  documents: any[];
  finalBlockConfig: any;
}

/**
 * Initial value population options
 */
export interface PopulateValuesOptions {
  initialValues?: Record<string, any>;
  snapshotValues?: Record<string, any>;
  randomValues?: Record<string, any>;
}

/**
 * Document generation result
 */
export interface DocumentGenerationResult {
  success: boolean;
  documentsGenerated: number;
  errors?: string[];
}

/**
 * Writeback execution result
 */
export interface WritebackExecutionResult {
  success: boolean;
  rowsCreated: number;
  errors: string[];
}
