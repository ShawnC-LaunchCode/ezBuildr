/**
 * Determines which map nodes/edges a `simulateWorkflowPath` result (MAP-7)
 * actually visits, for MAP-8's highlight/dim treatment (GH-153 AC3). Pure —
 * no React — matching `mapLayout.ts`/`mapLintDecoration.ts`'s discipline.
 *
 * `SimulatedPath.visited` only ever lists **section** ids (`resolveNextSection`
 * resolves to a section, never a step) and `traversedEdges` never fires for
 * the very first section entered (no edge exists "into the start" — see
 * `shared/workflowSimulation.ts`'s loop). So a node's on-path status can't be
 * read off `visited` alone: it also has to check whether the node is an
 * endpoint of any traversed edge, which is what makes a `final_documents`
 * step or the terminal node (neither of which is ever pushed to `visited`)
 * count as on-path too.
 *
 * `traversedEdges` already carries `buildWorkflowMap`'s edge-id convention
 * (per MAP-7's own doc comment) — matched here against the map's own `edges`
 * array (never re-derived from the id strings), per the ticket's own warning.
 */
import type { WorkflowMapEdge } from "@shared/workflowMap";
import type { SimulatedPath } from "@shared/workflowSimulation";

export interface SimulationHighlight {
  onPathNodeIds: Set<string>;
  onPathEdgeIds: Set<string>;
  /**
   * True when at least one node on the map is NOT on the simulated path —
   * i.e. there is something real to distinguish. False whenever every node
   * is trivially on-path (no rule fired, or none exists — the common case,
   * since `logic_rules` holds 0 rows across 85 production workflows today),
   * in which case `MapTab` renders every node/edge exactly as MAP-4 left it
   * rather than adding a highlight ring to literally everything.
   */
  hasOffPathNodes: boolean;
}

export function computeSimulationHighlight(
  simulation: SimulatedPath,
  nodeIds: readonly string[],
  edges: readonly WorkflowMapEdge[]
): SimulationHighlight {
  const onPathEdgeIds = new Set(simulation.traversedEdges);
  const onPathNodeIds = new Set(simulation.visited);

  for (const edge of edges) {
    if (onPathEdgeIds.has(edge.id)) {
      onPathNodeIds.add(edge.from);
      onPathNodeIds.add(edge.to);
    }
  }

  const hasOffPathNodes = nodeIds.some((id) => !onPathNodeIds.has(id));

  return { onPathNodeIds, onPathEdgeIds, hasOffPathNodes };
}
