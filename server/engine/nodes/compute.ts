import { evaluateExpression } from '../expr';

import type { EvalContext } from '../expr';

/**
 * Compute Node Executor
 * Handles compute nodes that calculate derived values
 */

export interface ComputeNodeConfig {
  outputKey: string;               // Variable name to store computed result
  expression: string;              // Expression to evaluate
  condition?: string;              // Optional conditional execution
  skipBehavior?: 'skip' | 'hide' | 'disable';
}

export interface ComputeNodeInput {
  nodeId: string;
  config: ComputeNodeConfig;
  context: EvalContext;
}

export interface ComputeNodeOutput {
  status: 'executed' | 'skipped';
  varName?: string;                // Variable name that was set
  varValue?: unknown;              // Computed value
  skipReason?: string;
}

/**
 * Execute a compute node
 *
 * @param input - Node configuration and execution context
 * @returns Execution result
 */
// eslint-disable-next-line @typescript-eslint/require-await
export async function executeComputeNode(
  input: ComputeNodeInput
): Promise<ComputeNodeOutput> {
  const { nodeId, config, context } = input;

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

    // Evaluate the expression
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = evaluateExpression(config.expression, context);

    // Store in context
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    context.vars[config.outputKey] = result;

    return {
      status: 'executed',
      varName: config.outputKey,
      varValue: result,
    };
  } catch (error) {
    throw new Error(
      `Compute node ${nodeId} failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}
