/**
 * Condition dependency graph — cycle and dangling-reference detection over
 * `visibleIf` expressions (Model A: `ConditionExpression` on steps and
 * sections, evaluated by `shared/conditionEvaluator.ts`).
 *
 * Model B (`logic_rules` rows) is explicitly out of scope here — see LU-3 /
 * Decision #3 in `tickets/LOGIC_UNIFICATION_TICKETS.md`: this initiative may
 * not change the `logic_rules` schema or its runtime evaluation.
 *
 * Kept as pure, framework-agnostic graph algorithms operating on a plain
 * adjacency list so they can be unit-tested directly against small
 * hand-built graphs, independent of how a workflow's sections/steps get
 * turned into node/edge data — that adaptation lives in
 * `server/services/workflowLintRules.ts`.
 */

/** A single dependency: `from`'s visibleIf references `to` as an operand. */
export interface ConditionDependencyEdge {
  from: string;
  to: string;
}

/** Adjacency-list view of a set of visibleIf dependencies (node id -> referenced ids). */
export type ConditionDependencyGraph = Map<string, string[]>;

/** One detected cycle, as the sequence of node ids traversed (first id repeated at the end). */
export interface ConditionCycle {
  path: string[];
}

const CONDITION_KEYWORDS = new Set(["true", "false", "null", "undefined", "and", "or", "not"]);

/** Walk a `ConditionExpression` tree collecting every `variable` operand it references. */
function collectVariableReferences(node: unknown): string[] {
  if (node === null || typeof node !== "object") { return []; }
  const obj = node as Record<string, unknown>;
  const vars: string[] = [];

  if (typeof obj.variable === "string" && obj.variable.length > 0) {
    vars.push(obj.variable);
  }
  if (Array.isArray(obj.conditions)) {
    for (const child of obj.conditions) {
      vars.push(...collectVariableReferences(child));
    }
  }
  return vars;
}

/**
 * Extract every operand identifier a `visibleIf` expression references.
 *
 * `visibleIf` is normally stored as a `ConditionExpression` object (jsonb):
 * `{ type: 'group', operator, conditions: [{ type: 'condition', variable, ... } | nested group] }`.
 * Older/imported rows may still be a raw string expression — both forms are
 * handled here.
 */
export function extractConditionReferences(expression: unknown): string[] {
  if (!expression) { return []; }
  const raw = typeof expression === "string"
    ? (expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [])
    : collectVariableReferences(expression);
  return raw.filter((id) => !CONDITION_KEYWORDS.has(id));
}

/**
 * Build an adjacency-list dependency graph directly from an explicit node-id
 * set and edge list. Every supplied node id is registered as a graph key
 * (even with zero outgoing edges) so `detectCycles`/`detectDanglingReferences`
 * can tell a "known but unreferenced" node apart from a dangling reference.
 *
 * This is the low-level constructor: it does no reference extraction or
 * alias/id resolution of its own, so a caller that needs to fold multiple
 * referenceable names (e.g. an alias AND a raw id both naming the same
 * element) onto one canonical node — see `server/services/workflowLintRules.ts`
 * — resolves that BEFORE building the edge list, not after.
 */
export function buildConditionDependencyGraphFromEdges(
  nodeIds: Iterable<string>,
  edges: ConditionDependencyEdge[]
): ConditionDependencyGraph {
  const graph: ConditionDependencyGraph = new Map();
  for (const id of nodeIds) {
    if (!graph.has(id)) { graph.set(id, []); }
  }
  for (const { from, to } of edges) {
    if (!graph.has(from)) { graph.set(from, []); }
    graph.get(from)!.push(to);
  }
  return graph;
}

/**
 * Build an adjacency-list dependency graph from a flat list of nodes, each
 * optionally carrying a `visibleIf` expression. An edge `from -> to` means
 * "`from`'s visibleIf references `to`" (`from` depends on `to`). Each node's
 * own `id` is also the only name that can resolve a reference to it — there
 * is no alias/id folding here (see `buildConditionDependencyGraphFromEdges`
 * for that).
 *
 * Every supplied node id is registered as a graph key (even with zero
 * outgoing edges) so `detectCycles`/`detectDanglingReferences` can tell a
 * "known but unreferenced" node apart from a dangling reference — callers
 * should pass every referenceable element (e.g. every step, whether or not
 * it has its own visibleIf), not just the ones with a visibleIf.
 */
export function buildConditionDependencyGraph(
  nodes: { id: string; visibleIf?: unknown }[]
): ConditionDependencyGraph {
  const edges: ConditionDependencyEdge[] = [];
  for (const node of nodes) {
    for (const ref of extractConditionReferences(node.visibleIf)) {
      edges.push({ from: node.id, to: ref });
    }
  }
  return buildConditionDependencyGraphFromEdges(nodes.map((n) => n.id), edges);
}

/**
 * Detect every cycle in a condition dependency graph.
 *
 * Complexity: O(V + E). A single DFS with three-colour (white/grey/black)
 * node marking — each node's colour flips WHITE -> GREY -> BLACK exactly
 * once, and each edge is inspected exactly once, so total work is linear in
 * (nodes + edges), not the O(V^2) a nested "does A eventually reach B, for
 * every pair A/B" scan would cost.
 *
 * Re-reaching an already-BLACK (fully processed) node through a second path
 * — e.g. the diamond A -> B -> D and A -> C -> D — is a normal DAG merge,
 * not a cycle, and is explicitly NOT reported: only hitting a GREY node
 * (an ancestor still on the current DFS path) counts as a cycle. This is
 * what keeps the detector from false-positiving on diamonds.
 */
export function detectCycles(graph: ConditionDependencyGraph): ConditionCycle[] {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of graph.keys()) { color.set(id, WHITE); }

  const cycles: ConditionCycle[] = [];
  const pathStack: string[] = [];
  const onPath = new Set<string>();

  function visit(node: string): void {
    color.set(node, GREY);
    pathStack.push(node);
    onPath.add(node);

    for (const neighbor of graph.get(node) ?? []) {
      if (!graph.has(neighbor)) { continue; } // dangling reference — not a graph edge, handled separately
      const neighborColor = color.get(neighbor);
      if (neighborColor === WHITE) {
        visit(neighbor);
      } else if (neighborColor === GREY && onPath.has(neighbor)) {
        const start = pathStack.indexOf(neighbor);
        cycles.push({ path: [...pathStack.slice(start), neighbor] });
      }
      // BLACK neighbor: already fully explored via some other path — a DAG
      // merge (the diamond case), never reported as a cycle.
    }

    pathStack.pop();
    onPath.delete(node);
    color.set(node, BLACK);
  }

  for (const id of graph.keys()) {
    if (color.get(id) === WHITE) { visit(id); }
  }

  return cycles;
}

/**
 * Detect edges pointing at a node id that is not itself a node in the graph
 * — i.e. a visibleIf referencing an alias that was never registered
 * (deleted or renamed step). Complexity: O(V + E), a single pass over every
 * node's outgoing edges.
 */
export function detectDanglingReferences(graph: ConditionDependencyGraph): ConditionDependencyEdge[] {
  const dangling: ConditionDependencyEdge[] = [];
  for (const [from, refs] of graph) {
    for (const to of refs) {
      if (!graph.has(to)) {
        dangling.push({ from, to });
      }
    }
  }
  return dangling;
}
