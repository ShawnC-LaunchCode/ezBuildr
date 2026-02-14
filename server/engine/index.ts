import type { WorkflowVersion } from '@shared/schema';
import type { ExecutionStep, VariableLineage, WorkflowTrace } from '@shared/types/debug';

import { createError } from '../utils/errors';

import { type EvalContext, evaluateExpression } from './expr';
import { executeNode } from './registry';
import { validateGraph, validateNodeConditions, type GraphJson } from './validate';
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
  inputJson: Record<string, unknown>;
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
  outputsDelta?: Record<string, unknown>;
  sideEffects?: Record<string, unknown>;
  error?: string;
  timestamp: Date;
}
export interface RunGraphOutput {
  status: 'success' | 'error';
  outputRefs?: Record<string, unknown>;
  logs: Array<{
    level: 'info' | 'warn' | 'error';
    message: string;
    nodeId?: string;
    context?: Record<string, unknown>;
    timestamp: Date;
  }>;
  trace?: TraceEntry[];            // Legacy simple trace
  executionTrace?: WorkflowTrace;  // Full rich trace
  error?: string;
}
// eslint-disable-next-line max-lines-per-function, complexity, sonarjs/cognitive-complexity -- Workflow execution engine requires complex orchestration logic
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
    const graphJson = workflowVersion.graphJson as GraphJson;
    if (typeof graphJson !== 'object' || graphJson === null) {
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
        .map(e => `${e.path ?? e.nodeId}: ${e.message}`)
        .join('; ');
      throw new Error(`Expression validation failed: ${errorMessages}`);
    }
    logs.push({
      level: 'info',
      message: 'Graph validation passed',
      timestamp: new Date(),
    });
    // Initialize execution context resources
    let isolate: import("isolated-vm").Isolate | undefined;
    try {
      const ivm = await import("isolated-vm");
      isolate = new ivm.Isolate({ memoryLimit: 128 });
    } catch {
      // Fallback or log if isolated-vm is missing (though it shouldn't be for live execution)
    }
    const context: EvalContext = {
      vars: { ...inputJson, input: inputJson },
      clock: options.clock ?? (() => new Date()),
      executionMode: input.executionMode ?? 'live',
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
    const outputRefs: Record<string, unknown> = {};
    try {
      for (const nodeId of executionOrder) {
        // Check limits
        if (Date.now() - startTime > (context.limits?.maxExecutionTimeMs ?? 30000)) {
          throw new Error(`Execution time exceeded limit of ${context.limits?.maxExecutionTimeMs ?? 30000}ms`);
        }
        if (executionSteps.length >= (context.limits?.maxSteps ?? 1000)) {
          throw new Error(`Execution step limit exceeded (${context.limits?.maxSteps ?? 1000})`);
        }
        const node = graphJson.nodes.find(n => n.id === nodeId);
        if (!node) {
          // ... (existing not found log) ...
          continue;
        }
        // SNAPSHOT EFFICIENCY: Skip blocks with already satisfied outputs (Part 5)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- node.config is dynamically typed based on node type
        const config = node.config as any;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- config shape varies by node type
        if (context.executionMode === 'snapshot' && config.outputKey !== undefined && context.vars[config.outputKey as string] !== undefined) {
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
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- config.outputKey is dynamic
            outputs: { [config.outputKey]: context.vars[config.outputKey as string] },
            durationMs: 0,
            metrics: { totalTimeMs: 0 }
          });
          continue; // Skip actual execution
        }
        const nodeStartTime = Date.now();
          // check for condition
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, max-depth -- config.condition varies by node type
          if (config.condition !== undefined) {
            // eslint-disable-next-line max-depth
            try {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
              const conditionResult = evaluateExpression(config.condition, context);
              // eslint-disable-next-line max-depth
              if (options.debug) {
                // Debug logging removed - use logger if needed
              }
              // eslint-disable-next-line max-depth
              if (!conditionResult) {
                const stepIndex = executionSteps.length;
                // Push skipped step
                executionSteps.push({
                  stepNumber: stepIndex,
                  blockId: nodeId,
                  blockType: node.type,
                  timestamp: new Date(),
                  status: 'skipped',
                  skippedReason: 'condition false',
                  inputs: {},
                  outputs: {},
                  durationMs: 0,
                  metrics: { totalTimeMs: 0 }
                });
                // Push legacy trace (for tests)
                trace.push({
                  nodeId,
                  type: node.type,
                  status: 'skipped',
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                  condition: config.condition,
                  conditionResult: false,
                  timestamp: new Date()
                });
                logs.push({
                  level: 'info',
                  message: `Skipped node ${nodeId} (condition false)`,
                  nodeId,
                  timestamp: new Date()
                });
                continue;
              } else {
                // Log condition true (optional, maybe debug only)
                // Add condition result to trace if executed?
                // The existing legacy trace might expect it.
              }
            } catch (condError) {
              // If condition evaluation fails, treat as error? Or fail closed (skip)?
              // Usually treat as error.
              throw new Error(`Condition evaluation failed for node ${nodeId}: ${condError instanceof Error ? condError.message : String(condError)}`);
            }
          }
          // Execute node
          const nodeOutput = await executeNode({
            node,
            context,
            tenantId,
            userInputs: inputJson,
          });
          const nodeDuration = Date.now() - nodeStartTime;
          // NEW: Collect output references (files)
          if (nodeOutput.status === 'executed' && 'outputRef' in nodeOutput && nodeOutput.outputRef) {
            outputRefs[nodeId] = nodeOutput.outputRef;
          }
          // NEW: Populate ExecutionStep and Lineage
          const stepIndex = executionSteps.length;
          const outputsDelta: Record<string, unknown> = {};
          if (nodeOutput.status === 'executed' && 'varName' in nodeOutput && nodeOutput.varName) {
            outputsDelta[nodeOutput.varName] = nodeOutput.varValue;
            // CRITICAL: Update context variables for subsequent nodes
            context.vars[nodeOutput.varName] = nodeOutput.varValue;
            // Debug logging removed - use logger if needed
            variableLineage[nodeOutput.varName] = {
              variableName: nodeOutput.varName,
              sourceType: mapNodeToSourceType(node.type),
              createdByBlockId: nodeId,
              createdAtStep: stepIndex
            };
          }
          // Track cost metrics
          if (node.type === 'query') {
            // eslint-disable-next-line max-depth
            if (context.metrics) {
              context.metrics.queryCount++;
              // approximating DB time as total node time for now
              // eslint-disable-next-line sonarjs/no-collapsible-if
              context.metrics.dbTimeMs += nodeDuration;
            }
          // eslint-disable-next-line sonarjs/no-collapsible-if
          } else if (node.type === 'compute') {
            // approximating JS time
            // eslint-disable-next-line max-depth
            if (context.metrics) {
              context.metrics.jsTimeMs += nodeDuration;
            }
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
          // Legacy Trace population (required for tests)
          trace.push({
            nodeId,
            type: node.type,
            status: nodeOutput.status as 'executed' | 'skipped',
            outputsDelta: outputsDelta,
            sideEffects: 'sideEffects' in nodeOutput ? nodeOutput.sideEffects as Record<string, unknown> : undefined,
            error: 'error' in nodeOutput ? nodeOutput.error : undefined,
            timestamp: new Date(),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            conditionResult: config.condition ? true : undefined
          });
          // Log execution (required for tests)
          if (nodeOutput.status === 'executed') {
            logs.push({
              level: 'info',
              message: `Executed node ${nodeId}`,
              nodeId,
              timestamp: new Date()
            });
          } else if (nodeOutput.status === 'skipped') {
            // Already logged in condition check? Or here?
            // If skipped by executeNode (e.g. internal logic), log here.
            // But my manual condition check logs it earlier.
            // Check duplicates? The set logic relies on string includes.
          }
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
        executionId: `exec-${new Date().toISOString()}`, // TODO: Use real ID
        workflowId: workflowVersion.workflowId,
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
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
      if (visited.has(nodeId)) { return; }
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
export function validateGraphStructure(graphJson: Record<string, unknown>): boolean {
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