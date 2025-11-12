import type { EvalContext } from '../expr';
import { evaluateExpression } from '../expr';

/**
 * Branch Node Executor
 * Handles conditional branching based on expressions
 */

export interface BranchNodeConfig {
  branches: Array<{
    condition: string;             // Expression to evaluate
    targetNodeId?: string;         // Optional target node to jump to
  }>;
  defaultTargetNodeId?: string;    // Default branch if no conditions match
  condition?: string;              // Optional wrapper condition for the entire branch node
  skipBehavior?: 'skip' | 'hide' | 'disable';
}

export interface BranchNodeInput {
  nodeId: string;
  config: BranchNodeConfig;
  context: EvalContext;
}

export interface BranchNodeOutput {
  status: 'executed' | 'skipped';
  selectedBranchIndex?: number;    // Which branch was taken (-1 for default)
  targetNodeId?: string;           // Next node to execute
  skipReason?: string;
}

/**
 * Execute a branch node
 *
 * @param input - Node configuration and execution context
 * @returns Execution result
 */
export async function executeBranchNode(
  input: BranchNodeInput
): Promise<BranchNodeOutput> {
  const { nodeId, config, context } = input;

  try {
    // Check wrapper condition if present
    if (config.condition) {
      const conditionResult = evaluateExpression(config.condition, context);
      if (!conditionResult) {
        return {
          status: 'skipped',
          skipReason: 'wrapper condition evaluated to false',
        };
      }
    }

    // Evaluate branches in order
    for (let i = 0; i < config.branches.length; i++) {
      const branch = config.branches[i];
      const branchResult = evaluateExpression(branch.condition, context);

      if (branchResult) {
        return {
          status: 'executed',
          selectedBranchIndex: i,
          targetNodeId: branch.targetNodeId,
        };
      }
    }

    // No branch matched, use default
    return {
      status: 'executed',
      selectedBranchIndex: -1,
      targetNodeId: config.defaultTargetNodeId,
    };
  } catch (error) {
    throw new Error(
      `Branch node ${nodeId} failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}
