import type { WorkflowVersion } from '@shared/schema';
import { renderTemplate } from '../services/templates';
import { createError } from '../utils/errors';
import type { EvalContext } from './expr';
import { validateGraph, validateNodeConditions, topologicalSort, type GraphJson } from './validate';
import { executeNode, type Node, type NodeOutput } from './registry';

/**
 * Workflow Engine
 * Executes workflow graphs with conditional logic and expression evaluation
 *
 * Stage 5: Expression evaluator + conditional logic integration
 */

export interface RunGraphOptions {
  debug?: boolean;
  clock?: () => Date;              // Injected clock for deterministic evaluation
}

export interface RunGraphInput {
  workflowVersion: WorkflowVersion;
  inputJson: Record<string, any>;
  tenantId: string;
  options?: RunGraphOptions;
}

export interface TraceEntry {
  nodeId: string;
  type: string;
  condition?: string;
  conditionResult?: boolean;
  status: 'executed' | 'skipped';
  outputsDelta?: Record<string, any>;
  error?: string;
  timestamp: Date;
}

export interface RunGraphOutput {
  status: 'success' | 'error';
  outputRefs?: Record<string, any>;
  logs: Array<{
    level: 'info' | 'warn' | 'error';
    message: string;
    nodeId?: string;
    context?: Record<string, any>;
    timestamp: Date;
  }>;
  trace?: TraceEntry[];            // Debug trace if debug mode enabled
  error?: string;
}

/**
 * Run workflow graph
 *
 * @param input - Workflow version, input data, tenant, and options
 * @returns Execution result with status, output references, and logs
 */
export async function runGraph(input: RunGraphInput): Promise<RunGraphOutput> {
  const { workflowVersion, inputJson, tenantId, options = {} } = input;
  const logs: RunGraphOutput['logs'] = [];
  const trace: TraceEntry[] = [];
  const startTime = Date.now();

  try {
    // Log start
    logs.push({
      level: 'info',
      message: `Starting workflow execution for version ${workflowVersion.id}`,
      timestamp: new Date(),
    });

    // Parse and validate graphJson structure
    const graphJson = workflowVersion.graphJson as unknown as GraphJson;
    if (!graphJson || typeof graphJson !== 'object') {
      throw new Error('Invalid graphJson: must be an object');
    }

    if (options.debug) {
      logs.push({
        level: 'info',
        message: 'Debug mode enabled',
        context: { inputJson, graphJson },
        timestamp: new Date(),
      });
    }

    // Validate graph structure
    const graphValidation = validateGraph(graphJson);
    if (!graphValidation.valid) {
      const errorMessages = graphValidation.errors.map(e => e.message).join('; ');
      throw new Error(`Graph validation failed: ${errorMessages}`);
    }

    // Validate node conditions and expressions
    const conditionsValidation = validateNodeConditions(graphJson);
    if (!conditionsValidation.valid) {
      const errorMessages = conditionsValidation.errors
        .map(e => `${e.path || e.nodeId}: ${e.message}`)
        .join('; ');
      throw new Error(`Expression validation failed: ${errorMessages}`);
    }

    logs.push({
      level: 'info',
      message: 'Graph validation passed',
      timestamp: new Date(),
    });

    // Initialize execution context
    const context: EvalContext = {
      vars: { ...inputJson },
      clock: options.clock || (() => new Date()),
    };

    // Get execution order (topological sort)
    const executionOrder = getExecutionOrder(graphJson);

    logs.push({
      level: 'info',
      message: `Executing ${executionOrder.length} nodes`,
      timestamp: new Date(),
    });

    // Execute nodes in order
    const outputRefs: Record<string, any> = {};

    for (const nodeId of executionOrder) {
      const node = graphJson.nodes.find(n => n.id === nodeId);
      if (!node) {
        logs.push({
          level: 'warn',
          message: `Node ${nodeId} not found in graph`,
          nodeId,
          timestamp: new Date(),
        });
        continue;
      }

      try {
        // Execute node
        const nodeOutput = await executeNode({
          node,
          context,
          tenantId,
          userInputs: inputJson,
        });

        // Record trace entry
        const traceEntry: TraceEntry = {
          nodeId: node.id,
          type: node.type,
          status: nodeOutput.status as 'executed' | 'skipped',
          timestamp: new Date(),
        };

        // Add condition info if present
        const nodeConfig = node.config as any;
        if (nodeConfig.condition) {
          traceEntry.condition = nodeConfig.condition;
          traceEntry.conditionResult = nodeOutput.status === 'executed';
        }

        // Record outputs delta if node was executed
        if (nodeOutput.status === 'executed') {
          const outputsDelta: Record<string, any> = {};

          if ('varName' in nodeOutput && nodeOutput.varName) {
            outputsDelta[nodeOutput.varName] = nodeOutput.varValue;
          }

          if ('outputRef' in nodeOutput && nodeOutput.outputRef) {
            outputRefs[nodeId] = nodeOutput.outputRef;
          }

          if (Object.keys(outputsDelta).length > 0) {
            traceEntry.outputsDelta = outputsDelta;
          }

          logs.push({
            level: 'info',
            message: `Executed node ${nodeId} (${node.type})`,
            nodeId,
            timestamp: new Date(),
          });
        } else {
          logs.push({
            level: 'info',
            message: `Skipped node ${nodeId}: ${nodeOutput.skipReason || 'condition false'}`,
            nodeId,
            timestamp: new Date(),
          });
        }

        trace.push(traceEntry);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        logs.push({
          level: 'error',
          message: `Node ${nodeId} failed: ${errorMessage}`,
          nodeId,
          timestamp: new Date(),
        });

        trace.push({
          nodeId: node.id,
          type: node.type,
          status: 'skipped',
          error: errorMessage,
          timestamp: new Date(),
        });

        // Fail fast on node execution errors
        throw new Error(`Node execution failed at ${nodeId}: ${errorMessage}`);
      }
    }

    // Log completion
    const duration = Date.now() - startTime;
    logs.push({
      level: 'info',
      message: `Workflow execution completed successfully in ${duration}ms`,
      timestamp: new Date(),
    });

    return {
      status: 'success',
      outputRefs: Object.keys(outputRefs).length > 0 ? outputRefs : undefined,
      logs,
      trace: options.debug ? trace : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logs.push({
      level: 'error',
      message: `Workflow execution failed: ${errorMessage}`,
      timestamp: new Date(),
    });

    return {
      status: 'error',
      logs,
      trace: options.debug ? trace : undefined,
      error: errorMessage,
    };
  }
}

/**
 * Get execution order for nodes (topological sort)
 */
function getExecutionOrder(graphJson: GraphJson): string[] {
  // Simple execution order: start node first, then follow edges
  if (graphJson.startNodeId) {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (nodeId: string): void => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      order.push(nodeId);

      // Find outgoing edges
      if (graphJson.edges) {
        const outgoingEdges = graphJson.edges.filter(e => e.source === nodeId);
        for (const edge of outgoingEdges) {
          visit(edge.target);
        }
      }
    };

    visit(graphJson.startNodeId);

    // Add any remaining nodes (shouldn't happen if graph is connected)
    for (const node of graphJson.nodes) {
      if (!visited.has(node.id)) {
        order.push(node.id);
      }
    }

    return order;
  }

  // Fallback: just return nodes in order
  return graphJson.nodes.map(n => n.id);
}

/**
 * Validate workflow graph structure
 *
 * @param graphJson - Workflow graph JSON
 * @returns true if valid, throws error otherwise
 */
export function validateGraphStructure(graphJson: Record<string, any>): boolean {
  // Use new validation
  const result = validateGraph(graphJson as unknown as GraphJson);
  if (!result.valid) {
    const errorMessages = result.errors.map(e => e.message).join('; ');
    throw createError.validation(`Invalid graph structure: ${errorMessages}`);
  }

  return true;
}
