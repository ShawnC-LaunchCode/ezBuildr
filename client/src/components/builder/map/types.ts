/**
 * `@xyflow/react` node/edge type wiring for the workflow map (MAP-4).
 *
 * Kept separate from `toFlowElements.ts` so the node components under
 * `./nodes/` and the conversion functions can both import it without a
 * circular dependency.
 */
import type { Edge, Node } from "@xyflow/react";

import type { WorkflowMapNodeKind } from "@shared/workflowMap";

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
   * has no section/step behind it to open.
   */
  onActivate?: () => void;
}

export type MapFlowNode = Node<MapNodeData, WorkflowMapNodeKind>;

/** Plain edges (built-in `@xyflow/react` edge types) — no custom edge component needed for a read-only map. */
export type MapFlowEdge = Edge;
