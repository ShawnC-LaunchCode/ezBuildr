import type { WorkflowVersion } from '@shared/schema';
import { renderTemplate } from '../services/templates';
import { createError } from '../utils/errors';
import type { EvalContext } from './expr';
import { validateGraph, validateNodeConditions, topologicalSort, type GraphJson } from './validate';
import { executeNode, type Node, type NodeOutput } from './registry';
import type { ExecutionStep, VariableLineage, WorkflowTrace } from '@shared/types/debug';

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
  executionMode?: 'live' | 'preview';
  options?: RunGraphOptions;
}

// DEPRECATED TraceEntry - Use ExecutionStep instead
export interface TraceEntry {
  nodeId: string;
  type: string;
  condition?: string;
  conditionResult?: boolean;
  status: 'executed' | 'skipped';
  outputsDelta?: Record<string, any>;
  sideEffects?: Record<string, any>;
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
  trace?: TraceEntry[];            // Legacy simple trace
  executionTrace?: WorkflowTrace;  // Full rich trace
  error?: string;
}

export async function runGraph(input: RunGraphInput): Promise<RunGraphOutput> {
  const { workflowVersion, inputJson, tenantId, options = {} } = input;
  const logs: RunGraphOutput['logs'] = [];
  const trace: TraceEntry[] = [];
  const executionSteps: ExecutionStep[] = [];
  const variableLineage: Record<string, VariableLineage> = {};
  // const listLineage: Record<string, ListLineage> = {}; // TODO: Implement List lineage
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

    // Initialize execution context resources
    let ivm: any;
    let isolate: any;
    try {
      ivm = await import("isolated-vm");
      isolate = new ivm.Isolate({ memoryLimit: 128 });
    } catch (e) {
      // Fallback or log if isolated-vm is missing (though it shouldn't be for live execution)
    }

    const context: EvalContext = {
      vars: { ...inputJson, input: inputJson },
      clock: options.clock || (() => new Date()),
      executionMode: input.executionMode || 'live',
      writes: input.executionMode === 'preview' ? {} : undefined,
      variableLineage,
      cache: {
        queries: new Map(),
        scripts: new Map() // Shared script cache for this run
      },
      metrics: {
        dbTimeMs: 0,
        jsTimeMs: 0,
        queryCount: 0
      },
      resources: {
        isolate
      },
      executedSideEffects: new Set(),
      limits: {
        maxExecutionTimeMs: 30000, // 30s hard limit
        maxSteps: 1000,
        // maxQueryCount not strictly enforced yet, but tracked
      }
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

    try {
      for (const nodeId of executionOrder) {
        // Check limits
        if (Date.now() - startTime > (context.limits!.maxExecutionTimeMs!)) {
          throw new Error(`Execution time exceeded limit of ${context.limits!.maxExecutionTimeMs}ms`);
        }
        if (executionSteps.length >= context.limits!.maxSteps!) {
          throw new Error(`Execution step limit exceeded (${context.limits!.maxSteps})`);
        }

        const node = graphJson.nodes.find(n => n.id === nodeId);
        if (!node) {
          // ... (existing not found log) ...
          continue;
        }

        // SNAPSHOT EFFICIENCY: Skip blocks with already satisfied outputs (Part 5)
        const config = node.config as any;
        if (context.executionMode === 'snapshot' && config.outputKey && context.vars[config.outputKey] !== undefined) {
          const stepIndex = executionSteps.length;
          // We can push a "Skipped" step to maintain trace continuity if desired,
          // or just implicitly skip. For observability, explicit skip is better.
          executionSteps.push({
            stepNumber: stepIndex,
            blockId: nodeId,
            blockType: node.type,
            timestamp: new Date(),
            status: 'skipped',
            skippedReason: 'snapshot satisfied (cached output)',
            inputs: {},
            outputs: { [config.outputKey]: context.vars[config.outputKey] },
            durationMs: 0,
            metrics: { totalTimeMs: 0 }
          });
          continue; // Skip actual execution
        }

        try {
          const nodeStartTime = Date.now();
          // Execute node
          const nodeOutput = await executeNode({
            node,
            context,
            tenantId,
            userInputs: inputJson,
          });
          const nodeDuration = Date.now() - nodeStartTime;

          // NEW: Populate ExecutionStep and Lineage
          const stepIndex = executionSteps.length;
          const outputsDelta: Record<string, any> = {};

          if (nodeOutput.status === 'executed' && 'varName' in nodeOutput && nodeOutput.varName) {
            outputsDelta[nodeOutput.varName] = nodeOutput.varValue;
            // ... (lineage generation) ...
          }

          // Track cost metrics
          if (node.type === 'query') {
            context.metrics!.queryCount++;
            // approximating DB time as total node time for now
            context.metrics!.dbTimeMs += nodeDuration;
          } else if (node.type === 'compute') {
            // approximating JS time
            context.metrics!.jsTimeMs += nodeDuration;
          }

          const executionStep: ExecutionStep = {
            stepNumber: stepIndex,
            blockId: nodeId,
            blockType: node.type,
            timestamp: new Date(),
            status: nodeOutput.status as 'executed' | 'skipped' | 'error',
            inputs: {}, // TODO: Capture resolved inputs
            outputs: outputsDelta,
            error: 'error' in nodeOutput ? nodeOutput.error : undefined,
            skippedReason: nodeOutput.skipReason,
            sideEffects: 'sideEffects' in nodeOutput && nodeOutput.sideEffects ? { writes: nodeOutput.sideEffects } : undefined,
            durationMs: nodeDuration,
            metrics: {
              // Per-step metrics
              totalTimeMs: nodeDuration
            }
          };
          executionSteps.push(executionStep);

          // ... (trace logic) ...

          // STOP EXECUTION if Final Block is reached
          if (node.type === 'final' && nodeOutput.status === 'executed') {
            logs.push({
              level: 'info',
              message: 'Final Block executed, stopping workflow',
              nodeId: nodeId,
              timestamp: new Date()
            });
            break; // Stop execution
          }

        } catch (error) {
          // ... (error handling) ...
          throw error;
        }
      }
    } finally {
      // Cleanup resources
      if (isolate) {
        isolate.dispose();
      }
    }

    // Log completion
    const duration = Date.now() - startTime;
    // ...

    return {
      status: 'success',
      outputRefs: Object.keys(outputRefs).length > 0 ? outputRefs : undefined,
      logs,
      trace: options.debug ? trace : undefined,
      executionTrace: options.debug ? {
        executionId: 'exec-' + new Date().toISOString(), // TODO: Use real ID
        workflowId: workflowVersion.workflowId!,
        workflowVersionId: workflowVersion.id,
        startTime: new Date(startTime),
        endTime: new Date(),
        status: 'success',
        steps: executionSteps,
        variableLineage,
        listLineage: {},
        metrics: {
          totalDurationMs: duration,
          totalDbTimeMs: context.metrics?.dbTimeMs,
          totalJsTimeMs: context.metrics?.jsTimeMs,
          queryCount: context.metrics?.queryCount,
          executionMode: context.executionMode as any
        }
      } : undefined
    };
  } catch (error) {
    // ... (error handling)
    return {
      status: 'error',
      logs,
      trace: options.debug ? trace : undefined,
      error: error instanceof Error ? error.message : 'Unknown error',
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

function mapNodeToSourceType(nodeType: string): VariableLineage['sourceType'] {
  switch (nodeType) {
    case 'question': return 'question';
    case 'compute': return 'compute';
    case 'query': return 'query';
    case 'write': return 'writeResult';
    case 'http': return 'externalResult';
    default: return 'transform'; // Fallback
  }
}
