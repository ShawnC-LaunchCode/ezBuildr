/**
 * Review Node Executor
 * Handles human review gates for workflow approval/rejection
 *
 * Stage 14: E-Signature Node + Document Review Portal
 */

import { evaluateExpression } from '../expr';

import type { EvalContext } from '../expr';

/**
 * Review Node Configuration
 */
export interface ReviewNodeConfig {
  reviewerType: 'internal' | 'external';
  reviewerUserId?: string;
  reviewerEmail?: string;
  message?: string;
  allowEdit?: boolean;
  autoApproveIfNoChange?: boolean;
  condition?: string;
}

/**
 * Review Node Input
 */
export interface ReviewNodeInput {
  nodeId: string;
  config: ReviewNodeConfig;
  context: EvalContext;
  runId: string;
  workflowId: string;
  tenantId: string;
  projectId: string;
}

/**
 * Review Node Output
 */
export interface ReviewNodeOutput {
  status: 'executed' | 'skipped' | 'waiting';
  reviewTaskId?: string;
  skipReason?: string;
  error?: string;
}

/**
 * Execute a review node
 *
 * This node creates a review task and pauses the workflow execution
 * until a human reviewer approves or rejects the work.
 *
 * @param input - Node configuration and execution context
 * @returns Execution result with waiting status
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function executeReviewNode(
  input: ReviewNodeInput
): Promise<ReviewNodeOutput> {
  const { nodeId, config, context, runId, workflowId, tenantId, projectId } = input;

  try {
    // Check condition if present
    if (config.condition) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const conditionResult = evaluateExpression(config.condition, context);
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (!conditionResult) {
        return {
          status: 'skipped',
          skipReason: 'condition evaluated to false',
        };
      }
    }

    // Validate reviewer configuration
    if (config.reviewerType === 'internal' && !config.reviewerUserId) {
      throw new Error('reviewerUserId is required for internal reviewer');
    }
    if (config.reviewerType === 'external' && !config.reviewerEmail) {
      throw new Error('reviewerEmail is required for external reviewer');
    }

    // Store review task info in context for service layer to create
    // The actual database operation will be handled by the service layer
    // to avoid circular dependencies
    context.vars['__pendingReviewTask'] = {
      nodeId,
      runId,
      workflowId,
      tenantId,
      projectId,
      reviewerType: config.reviewerType,
      reviewerId: config.reviewerUserId,
      reviewerEmail: config.reviewerEmail,
      message: config.message,
    };

    return {
      status: 'waiting',
    };
  } catch (error) {
    return {
      status: 'skipped',
      error: error instanceof Error ? error.message : UNKNOWN_ERROR_MSG,
    };
  }
}

const UNKNOWN_ERROR_MSG = 'Unknown error';
