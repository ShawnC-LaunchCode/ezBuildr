/**
 * Condition dependency graph — cycle and dangling-reference detection over
 * `visibleIf` expressions (Model A: `ConditionExpression` on steps and
 * sections, evaluated by `shared/conditionEvaluator.ts`), PLUS (MAP-3)
 * workflow FLOW analysis — reachability, dead ends, and skip_to loop risk
 * over the section-to-section navigational graph.
 *
 * These are two distinct graphs sharing one module because they share the
 * same pure, hand-testable adjacency-list discipline:
 *  - `visibleIf` dependencies (the pull model: an element carries its own
 *    condition) — `buildConditionDependencyGraph`, `detectCycles`,
 *    `detectDanglingReferences`.
 *  - The navigational flow graph (sections/terminal connected by `sequential`
 *    order edges and `skip_to` push edges) — `analyzeWorkflowFlow`.
 * Workflow logic rules' *evaluation* (which needs run-time `data` to know
 * which rules actually fire) is `shared/workflowLogic.ts`'s job; both graphs
 * here are static structure only.
 *
 * History: `git log -p -- tickets/LOGIC_UNIFICATION_TICKETS.md` (LU-3);
 * `git log -p -- tickets/WORKFLOW_MAP_TICKETS.md` (MAP-3).
 *
 * Kept as pure, framework-agnostic graph algorithms operating on a plain
 * adjacency list so they can be unit-tested directly against small
 * hand-built graphs, independent of how a workflow's sections/steps get
 * turned into node/edge data — that adaptation lives in
 * `server/services/workflowLintRules.ts` (and, for the client map,
 * `shared/workflowMap.ts`). `analyzeWorkflowFlow` takes plain structural
 * `{ id, kind, order }` / `{ id, from, to, kind }` shapes rather than
 * `shared/workflowMap.ts`'s named types for the same reason — it lets both
 * producers feed it without either importing the other.
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
 * `visibleIf` is a `ConditionExpression` object (jsonb):
 * `{ type: 'group', operator, conditions: [{ type: 'condition', variable, ... } | nested group] }`.
 *
 * O-4: this used to also accept a raw *string* expression and pull identifiers
 * out of it with a bare `[a-zA-Z_]\w*` regex. That branch was both dead and
 * dangerous. Dead: zero string-shaped rows exist (all 52 populated `visible_if`
 * values are objects), and the ingest DTO that claimed to accept a string only
 * ever reached storage through an `as unknown as` cast. Dangerous: the regex
 * matched string *literals* too, so `name == 'foo'` yielded `foo` as an
 * operand — and since LU-3 made unresolvable references publish-blocking
 * errors, one such value would have blocked publish with a nonsense message.
 * A string can no longer be stored (`shared/types/ai.ts` and the ingest DTO
 * both require a `ConditionExpression`), so the branch is gone rather than
 * left as a trap.
 */
export function extractConditionReferences(expression: unknown): string[] {
  if (!expression) { return []; }
  // No keyword filtering: operands come from a structured tree, so a value
  // like "or" can only be a genuine step alias. Filtering those would drop a
  // real edge and could hide a cycle.
  return collectVariableReferences(expression);
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

/**
 * A node in the workflow navigational flow graph (MAP-3). Structural only —
 * `kind` and `order` are read but never validated against a closed union, so
 * both `shared/workflowMap.ts`'s `WorkflowMapNode` and a local server-side
 * adapter satisfy this with no cast.
 */
export interface WorkflowFlowNode {
  id: string;
  kind: string;
  order: number;
}

/** A directed edge in the workflow navigational flow graph (MAP-3). */
export interface WorkflowFlowEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
}

export interface WorkflowFlowDiagnostics {
  /** Node ids with no path from the first node (lowest `order`). */
  unreachable: string[];
  /** Non-terminal node ids with no outgoing edge. */
  deadEnds: string[];
  /**
   * Cycles found among `skip`-kind edges ONLY. `sequential` edges are
   * deliberately excluded from this graph, not just incidental to it: they
   * strictly increase `order` by construction, so they can never themselves
   * close a loop, but a single backward `skip` edge combined with the
   * (always-present) sequential chain back to it forms a *trivial* 2-node
   * cycle for literally every backward skip. That case already has its own
   * finding (a no-op warning, since `isForwardSkipTarget` guards it at run
   * time) — mixing sequential edges in here would report the same rule
   * twice, once correctly as a no-op warning and once misleadingly as a
   * "loop". A genuine loop risk is a chain of `skip` rules that cycle among
   * themselves, independent of the sequential spine.
   */
  loops: { path: string[] }[];
}

/**
 * Detect unreachable nodes, dead ends, and skip-cycle loop risk over a
 * workflow's navigational graph (sections/terminal, `sequential` + `skip`
 * edges). GH-153 AC4 / MAP-3.
 *
 * Reachability and dead-end detection walk every supplied edge (both kinds
 * represent a real route); loop detection walks `skip` edges only — see
 * `WorkflowFlowDiagnostics.loops`.
 *
 * Complexity: O(V + E) — one BFS for reachability, one linear pass for
 * dead-end out-degree, and `detectCycles`'s own linear three-colour DFS for
 * loops. No second cycle detector: reusing `detectCycles` keeps the diamond
 * case (two edges converging on one node through different paths) correctly
 * unreported — see that function's doc comment.
 */
export function analyzeWorkflowFlow(
  nodes: WorkflowFlowNode[],
  edges: WorkflowFlowEdge[]
): WorkflowFlowDiagnostics {
  const nodeIds = nodes.map((node) => node.id);
  const fullGraph = buildConditionDependencyGraphFromEdges(
    nodeIds,
    edges.map(({ from, to }) => ({ from, to }))
  );
  const skipGraph = buildConditionDependencyGraphFromEdges(
    nodeIds,
    edges.filter((edge) => edge.kind === "skip").map(({ from, to }) => ({ from, to }))
  );

  return {
    unreachable: findUnreachableFlowNodes(nodes, fullGraph),
    deadEnds: nodes
      .filter((node) => node.kind !== "terminal" && (fullGraph.get(node.id) ?? []).length === 0)
      .map((node) => node.id),
    loops: findFlowLoops(skipGraph),
  };
}

/** BFS from the lowest-`order` node over every supplied edge. */
function findUnreachableFlowNodes(
  nodes: WorkflowFlowNode[],
  graph: ConditionDependencyGraph
): string[] {
  if (nodes.length === 0) { return []; }
  // `nodes.length > 0` guarantees a first element, but under the strict
  // zones' `noUncheckedIndexedAccess` an array destructure is still
  // `T | undefined`, so it's checked rather than asserted (matches
  // `detectCycles`'s `[firstNode]` pattern above).
  const [start] = [...nodes].sort((a, b) => a.order - b.order);
  if (start === undefined) { return []; }

  const visited = new Set<string>([start.id]);
  const queue: string[] = [start.id];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) { break; }
    for (const next of graph.get(current) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return nodes.map((node) => node.id).filter((id) => !visited.has(id));
}

/** Cycles from `detectCycles`, deduplicated by their (unordered) node set. */
function findFlowLoops(graph: ConditionDependencyGraph): { path: string[] }[] {
  const seen = new Set<string>();
  const loops: { path: string[] }[] = [];
  for (const cycle of detectCycles(graph)) {
    const key = [...new Set(cycle.path)].sort().join("|");
    if (seen.has(key)) { continue; }
    seen.add(key);
    loops.push({ path: cycle.path });
  }
  return loops;
}
