/**
 * Shared classNames/notes for the map's simulation highlight state (MAP-8,
 * GH-153 AC3/AC4). `data.simulation` is undefined whenever there is nothing
 * to distinguish — either no simulation has resolved yet, or (the common
 * case, since `logic_rules` holds 0 rows across 85 production workflows)
 * every node sits on the one unconditional path, so dimming would add visual
 * noise with zero information value. In that case every node component
 * renders exactly as MAP-4 left it — `MapTab` is the only caller that decides
 * whether to hand down a real `simulation` value at all (see
 * `computeSimulationHighlight`'s `hasOffPathNodes`).
 *
 * AC4 requires the highlight/dim states to be distinguishable by more than
 * colour. The dimmed treatment removes colour entirely (`filter: grayscale`)
 * and reduces opacity — a categorically different rendering, not a hue
 * change — and pairs it with a screen-reader-only note (`simulationDimmedNote`)
 * so the distinction survives without vision at all. **Deliberately never
 * touches `aria-label`**: several existing MAP-4/5/6 tests assert a node's
 * accessible name as an exact string, and appending to `aria-label` would
 * silently break every one of them the first time a simulation runs against
 * an unconditional rule (see `useWorkflowSimulation.ts`'s note on
 * `when: undefined` meaning "always fires").
 */
import type { MapNodeData } from "./types";

export const SIMULATION_ONPATH_NODE_CLASS = "workflow-map-node-onpath";
export const SIMULATION_DIMMED_NODE_CLASS = "workflow-map-node-dimmed";

export function simulationNodeClassName(simulation: MapNodeData["simulation"]): string {
  if (!simulation) { return ""; }
  return simulation.onPath ? SIMULATION_ONPATH_NODE_CLASS : SIMULATION_DIMMED_NODE_CLASS;
}

/** A visually-hidden note for the minority (off-path) case only — nothing is added for the majority on-path case, matching the visual treatment's "decorate the exception" design. */
export function simulationDimmedNote(simulation: MapNodeData["simulation"]): string | null {
  if (!simulation || simulation.onPath) { return null; }
  return "Not on the currently simulated path.";
}
