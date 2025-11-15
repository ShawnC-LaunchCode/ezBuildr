import { validateExpression } from './expr';
import type { Node } from './registry';
import type { QuestionNodeConfig } from './nodes/question';
import type { ComputeNodeConfig } from './nodes/compute';
import type { BranchNodeConfig } from './nodes/branch';
import type { TemplateNodeConfig } from './nodes/template';

/**
 * Static Graph and Expression Validation
 * Validates workflow graphs and expressions before execution
 */

export interface GraphJson {
  nodes: Node[];
  edges?: Array<{
    id: string;
    source: string;
    target: string;
  }>;
  startNodeId?: string;
}

export interface ValidationError {
  nodeId?: string;
  field?: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate entire workflow graph
 *
 * @param graphJson - Workflow graph structure
 * @returns Validation result
 */
export function validateGraph(graphJson: GraphJson): ValidationResult {
  const errors: ValidationError[] = [];

  // Check basic structure
  if (!graphJson || typeof graphJson !== 'object') {
    return {
      valid: false,
      errors: [{ message: 'Graph must be an object' }],
    };
  }

  if (!Array.isArray(graphJson.nodes)) {
    return {
      valid: false,
      errors: [{ message: 'Graph must have a nodes array' }],
    };
  }

  if (graphJson.nodes.length === 0) {
    return {
      valid: false,
      errors: [{ message: 'Graph must have at least one node' }],
    };
  }

  // Validate node IDs are unique
  const nodeIds = new Set<string>();
  for (const node of graphJson.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push({
        nodeId: node.id,
        message: `Duplicate node ID: ${node.id}`,
      });
    }
    nodeIds.add(node.id);
  }

  // Validate edges reference existing nodes
  if (graphJson.edges) {
    for (const edge of graphJson.edges) {
      if (!nodeIds.has(edge.source)) {
        errors.push({
          message: `Edge references non-existent source node: ${edge.source}`,
        });
      }
      if (!nodeIds.has(edge.target)) {
        errors.push({
          message: `Edge references non-existent target node: ${edge.target}`,
        });
      }
    }
  }

  // Check for cycles (simple DFS-based check)
  const cycleErrors = detectCycles(graphJson);
  errors.push(...cycleErrors);

  // Check reachability from start node
  if (graphJson.startNodeId) {
    if (!nodeIds.has(graphJson.startNodeId)) {
      errors.push({
        message: `Start node does not exist: ${graphJson.startNodeId}`,
      });
    } else {
      const unreachable = findUnreachableNodes(graphJson);
      for (const nodeId of unreachable) {
        errors.push({
          nodeId,
          message: `Node is unreachable from start node`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Collect all available variables at each node in the graph
 *
 * @param graphJson - Workflow graph structure
 * @returns Map of node ID to available variable names
 */
export function collectAvailableVars(graphJson: GraphJson): Map<string, string[]> {
  const availableVars = new Map<string, string[]>();
  const allVars = new Set<string>();

  // First pass: collect all variable outputs
  for (const node of graphJson.nodes) {
    const nodeVars = getNodeOutputVars(node);
    nodeVars.forEach(v => allVars.add(v));
  }

  // Second pass: for each node, determine what's available
  // For simplicity, we assume all previously defined vars are available
  // In a more sophisticated implementation, we'd do topological ordering
  const orderedNodes = topologicalSort(graphJson);

  const varsAtNode = new Set<string>();
  for (const nodeId of orderedNodes) {
    const node = graphJson.nodes.find(n => n.id === nodeId);
    if (!node) continue;

    // Variables available at this node
    availableVars.set(nodeId, Array.from(varsAtNode));

    // Add this node's outputs for subsequent nodes
    const outputs = getNodeOutputVars(node);
    outputs.forEach(v => varsAtNode.add(v));
  }

  return availableVars;
}

/**
 * Validate all node conditions and expressions
 *
 * @param graphJson - Workflow graph structure
 * @returns Validation result
 */
export function validateNodeConditions(graphJson: GraphJson): ValidationResult {
  const errors: ValidationError[] = [];
  const availableVars = collectAvailableVars(graphJson);

  for (const node of graphJson.nodes) {
    const varsAtNode = availableVars.get(node.id) || [];

    // Validate node-level condition
    const config = node.config as any;
    if (config.condition) {
      const result = validateExpression(config.condition, varsAtNode);
      if (!result.ok) {
        errors.push({
          nodeId: node.id,
          field: 'condition',
          message: result.error,
          path: `nodes.${node.id}.config.condition`,
        });
      }
    }

    // Validate node-specific expressions
    switch (node.type) {
      case 'compute': {
        const computeConfig = config as ComputeNodeConfig;
        const result = validateExpression(computeConfig.expression, varsAtNode);
        if (!result.ok) {
          errors.push({
            nodeId: node.id,
            field: 'expression',
            message: result.error,
            path: `nodes.${node.id}.config.expression`,
          });
        }
        break;
      }

      case 'branch': {
        const branchConfig = config as BranchNodeConfig;
        for (let i = 0; i < branchConfig.branches.length; i++) {
          const branch = branchConfig.branches[i];
          const result = validateExpression(branch.condition, varsAtNode);
          if (!result.ok) {
            errors.push({
              nodeId: node.id,
              field: `branches[${i}].condition`,
              message: result.error,
              path: `nodes.${node.id}.config.branches[${i}].condition`,
            });
          }
        }
        break;
      }

      case 'template': {
        const templateConfig = config as TemplateNodeConfig;
        for (const [placeholder, expression] of Object.entries(templateConfig.bindings)) {
          const result = validateExpression(expression, varsAtNode);
          if (!result.ok) {
            errors.push({
              nodeId: node.id,
              field: `bindings.${placeholder}`,
              message: result.error,
              path: `nodes.${node.id}.config.bindings.${placeholder}`,
            });
          }
        }
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get output variable names for a node
 */
function getNodeOutputVars(node: Node): string[] {
  const config = node.config as any;

  switch (node.type) {
    case 'question':
      return [(config as QuestionNodeConfig).key];
    case 'compute':
      return [(config as ComputeNodeConfig).outputKey];
    case 'branch':
    case 'template':
    default:
      return [];
  }
}

/**
 * Detect cycles in the graph
 */
function detectCycles(graphJson: GraphJson): ValidationError[] {
  const errors: ValidationError[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();

  const adjacency = buildAdjacencyList(graphJson);

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) {
          return true;
        }
      } else if (recStack.has(neighbor)) {
        errors.push({
          nodeId,
          message: `Cycle detected involving node ${nodeId}`,
        });
        return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of graphJson.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return errors;
}

/**
 * Find nodes unreachable from start node
 */
function findUnreachableNodes(graphJson: GraphJson): string[] {
  if (!graphJson.startNodeId) return [];

  const reachable = new Set<string>();
  const adjacency = buildAdjacencyList(graphJson);

  function dfs(nodeId: string) {
    reachable.add(nodeId);
    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!reachable.has(neighbor)) {
        dfs(neighbor);
      }
    }
  }

  dfs(graphJson.startNodeId);

  const unreachable: string[] = [];
  for (const node of graphJson.nodes) {
    if (!reachable.has(node.id)) {
      unreachable.push(node.id);
    }
  }

  return unreachable;
}

/**
 * Build adjacency list from graph
 */
function buildAdjacencyList(graphJson: GraphJson): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  // Initialize all nodes
  for (const node of graphJson.nodes) {
    adjacency.set(node.id, []);
  }

  // Add edges
  if (graphJson.edges) {
    for (const edge of graphJson.edges) {
      const neighbors = adjacency.get(edge.source) || [];
      neighbors.push(edge.target);
      adjacency.set(edge.source, neighbors);
    }
  }

  return adjacency;
}

/**
 * Topological sort of nodes
 */
export function topologicalSort(graphJson: GraphJson): string[] {
  const adjacency = buildAdjacencyList(graphJson);
  const visited = new Set<string>();
  const result: string[] = [];

  function dfs(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighbor of neighbors) {
      dfs(neighbor);
    }

    result.unshift(nodeId);
  }

  // Start from start node if available, otherwise process all
  if (graphJson.startNodeId) {
    dfs(graphJson.startNodeId);
  } else {
    for (const node of graphJson.nodes) {
      dfs(node.id);
    }
  }

  return result;
}
