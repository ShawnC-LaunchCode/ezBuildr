/**
 * `@xyflow/react` node/edge type wiring for the workflow map (MAP-4).
 *
 * Kept separate from `toFlowElements.ts` so the node components under
 * `./nodes/` and the conversion functions can both import it without a
 * circular dependency.
 */
import type { BuiltInEdge, Node } from "@xyflow/react";

import type { WorkflowMapNodeKind } from "@shared/workflowMap";
import type { WorkflowLintIssue } from "@shared/types/workflowLint";

/** The fields a map node component needs — a render-only projection of `WorkflowMapNode` (shared/workflowMap.ts). */
export interface MapNodeData extends Record<string, unknown> {
  label: string;
  order: number;
  /** Own visibility is conditional (visibleIf, or targeted by a show/hide rule) — MAP-2 AC5. */
  conditional: boolean;
  /** Present for the expand-on-demand payload (D-2); MAP-4 does not render step-level detail. */
  conditionalStepIds: string[];
  /**
   * MAP-5: activation callback (click, Enter or Space on the node's own
   * `<button>`) that navigates to the node's inspector via a URL — see
   * `MapTab`'s `handleActivateNode`. Undefined for the terminal node, which
   * has no page/step behind it to open.
   */
  onActivate?: () => void;
  /**
   * MAP-6: lint findings from `GET /api/workflows/:id/lint` whose
   * `target.pageId` equals this node's id — always an array (possibly
   * empty), never computed by the map itself. See `mapLintDecoration.ts`.
   */
  findings: WorkflowLintIssue[];
  /**
   * MAP-8: whether this node is on the currently simulated path
   * (`shared/workflowSimulation.ts`, via `MapTab`'s `computeSimulationHighlight`).
   * Undefined whenever there's nothing to distinguish — see
   * `simulationStyles.ts`'s doc comment for why that's the common case and
   * why it's deliberately never folded into `aria-label`.
   */
  simulation?: { onPath: boolean };
}

export type MapFlowNode = Node<MapNodeData, WorkflowMapNodeKind>;

/**
 * Built-in `@xyflow/react` edge types only — no custom edge component needed
 * for a read-only map. `BuiltInEdge` (rather than the bare `Edge`) is what
 * gives skip edges a typed `pathOptions.offset` (MAP-8 review fix: routing
 * skip edges around a bypassed node instead of through it).
 */
export type MapFlowEdge = BuiltInEdge;
