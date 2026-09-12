/**
 * CB-4: the Code Block dependency graph.
 *
 * Execution order used to be a hand-set integer (`transform_blocks.order`), so
 * if block B consumed block A's output the author had to get the integers right
 * by hand. When they did not, B read A's PREVIOUS output and lagged one page
 * submit behind — silent, and very hard to debug.
 *
 * CB-1's append-only rule makes this solvable statically: every variable has
 * exactly one writer (enforced by `steps_workflow_alias_unique`), so the block
 * graph is a fixed DAG known at author time. This module builds it from the
 * DECLARED inputs/outputs — never by parsing code, which is CB-5's job — and
 * topologically sorts it.
 *
 * Cycles are rejected at SAVE time, in the editor. There is deliberately no
 * runtime fixpoint iteration and no cycle-breaking heuristic: a saved workflow
 * is acyclic by construction, so the runtime can trust the order it is given.
 *
 * Pure and DB-free, so the ordering rules are testable without a database.
 */

export type CodeBlockNode = {
  id: string;
  /** The author-visible `steps.order`, used only to break ties deterministically. */
  order: number;
  /** Declared input variable keys (aliases). */
  inputs: readonly string[];
  /** Declared output variable keys (aliases). One writer per variable. */
  outputs: readonly string[];
};

/** Stable ordering for nodes that the graph does not constrain (AC 6). */
function byOrderThenId(a: CodeBlockNode, b: CodeBlockNode): number {
  return a.order === b.order ? a.id.localeCompare(b.id) : a.order - b.order;
}

/**
 * Map each declared output variable to the block that writes it.
 *
 * A duplicate here means two blocks claim one variable, which the unique index
 * on `steps.alias` already makes impossible to persist. If it is somehow seen
 * anyway, the FIRST writer wins rather than silently rewiring the graph to the
 * last one, and the caller is expected to have rejected the save already.
 */
function buildProducers(nodes: readonly CodeBlockNode[]): Map<string, string> {
  const producers = new Map<string, string>();
  for (const node of [...nodes].sort(byOrderThenId)) {
    for (const output of node.outputs) {
      if (!producers.has(output)) { producers.set(output, node.id); }
    }
  }
  return producers;
}

/**
 * Find one dependency cycle and describe it in the author's vocabulary —
 * variable names, not step ids: `support_total -> net_income -> support_total`.
 *
 * Returns null when the graph is acyclic.
 */
export function findCycle(nodes: readonly CodeBlockNode[]): string[] | null {
  const producers = buildProducers(nodes);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const state = new Map<string, 'visiting' | 'done'>();
  // The variable that justified each edge we walked, so the report can name
  // variables rather than opaque step ids.
  const path: Array<{ nodeId: string; viaVariable: string | null }> = [];

  function walk(nodeId: string, viaVariable: string | null): string[] | null {
    const existing = state.get(nodeId);
    if (existing === 'done') { return null; }
    if (existing === 'visiting') {
      const start = path.findIndex(entry => entry.nodeId === nodeId);
      const loop = path.slice(start);
      // Each hop is labelled with the variable that created the dependency;
      // close the loop by repeating the variable we came back in on.
      const variables = loop.map(entry => entry.viaVariable).filter((v): v is string => v !== null);
      const closing = viaVariable ?? variables[0];
      return closing === undefined ? variables : [...variables, closing];
    }
    state.set(nodeId, 'visiting');
    path.push({ nodeId, viaVariable });
    const node = byId.get(nodeId);
    for (const input of node?.inputs ?? []) {
      const producer = producers.get(input);
      // An input with no producing block is a plain question, not an edge.
      if (producer === undefined || producer === nodeId) { continue; }
      const found = walk(producer, input);
      if (found) { return found; }
    }
    path.pop();
    state.set(nodeId, 'done');
    return null;
  }

  for (const node of [...nodes].sort(byOrderThenId)) {
    const found = walk(node.id, null);
    if (found) { return found; }
  }
  return null;
}

/**
 * Topological execution order: a block always runs after every block that
 * writes one of its inputs.
 *
 * Kahn's algorithm with a deterministic tie-break, so independent blocks
 * execute in a stable order run after run (AC 6) rather than in whatever order
 * the definition happened to load in.
 *
 * @throws when the graph contains a cycle, naming the variables involved.
 *         Callers at runtime should never see this: saves are rejected first.
 */
export function buildExecutionOrder(nodes: readonly CodeBlockNode[]): string[] {
  const producers = buildProducers(nodes);
  const sorted = [...nodes].sort(byOrderThenId);
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, string[]>();

  for (const node of sorted) {
    dependencies.set(node.id, new Set());
    dependents.set(node.id, []);
  }
  for (const node of sorted) {
    for (const input of node.inputs) {
      const producer = producers.get(input);
      if (producer === undefined || producer === node.id) { continue; }
      if (!dependencies.has(producer)) { continue; }
      dependencies.get(node.id)!.add(producer);
    }
  }
  for (const node of sorted) {
    for (const dependency of dependencies.get(node.id)!) {
      dependents.get(dependency)!.push(node.id);
    }
  }

  // Ready set kept in tie-break order; taking the smallest each time is what
  // makes the output stable rather than merely valid.
  const ready = sorted.filter(node => dependencies.get(node.id)!.size === 0).map(node => node.id);
  const result: string[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => byOrderThenId(
      sorted.find(node => node.id === a)!,
      sorted.find(node => node.id === b)!
    ));
    const nextId = ready.shift()!;
    result.push(nextId);
    for (const dependent of dependents.get(nextId)!) {
      const remaining = dependencies.get(dependent)!;
      remaining.delete(nextId);
      if (remaining.size === 0) { ready.push(dependent); }
    }
  }

  if (result.length !== sorted.length) {
    const cycle = findCycle(sorted);
    throw new Error(
      `Validation error: Code Block inputs and outputs form a cycle: ${(cycle ?? []).join(' → ')}`
    );
  }
  return result;
}
