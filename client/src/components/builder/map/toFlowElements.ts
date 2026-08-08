/**
 * Converts `shared/workflowMap.ts`'s plain node/edge graph into
 * `@xyflow/react` elements (MAP-4). Pure — no React, no rendering — so the
 * node-kind and edge-kind mapping is unit-testable on its own, independent
 * of whether `@xyflow/react` actually mounts in the test environment.
 *
 * Per D-4 the map is read-only: every node is built with
 * `draggable: false` / `connectable: false` here too, in addition to the
 * global `nodesDraggable`/`nodesConnectable` props MapTab sets on
 * `<ReactFlow>` — belt and suspenders, not a substitute for the global prop.
 *
 * MAP-5: `toFlowNodes` takes an optional `onActivateNode` callback and wires
 * it into every non-terminal node's `data.onActivate` (rendered as a real
 * `<button>` by the node components under `./nodes/`). The xyflow-level node
 * itself is kept non-focusable here — the node's own button is the real,
 * correctly-labelled, keyboard-activatable control, and giving the library's
 * own node wrapper a `tabIndex` too would add a second, unlabeled Tab stop
 * ahead of it for no benefit (its `onKeyDown` only manages xyflow's internal
 * selection state, not this callback).
 */
import { MarkerType } from "@xyflow/react";

import type { WorkflowMapEdge, WorkflowMapNode } from "@shared/workflowMap";

import { computeMapLayout } from "./mapLayout";
import type { MapFlowEdge, MapFlowNode } from "./types";

/** Class names carry the edge-kind distinction into the DOM for tests and CSS — never color alone (MAP-4 AC4/AC7). */
export const SEQUENTIAL_EDGE_CLASS = "workflow-map-edge-sequential";
export const SKIP_EDGE_CLASS = "workflow-map-edge-skip";

export function toFlowNodes(
  nodes: WorkflowMapNode[],
  edges: WorkflowMapEdge[],
  onActivateNode?: (node: WorkflowMapNode) => void
): MapFlowNode[] {
  const positions = computeMapLayout(nodes, edges);
  return nodes.map((node) => {
    const position = positions[node.id] ?? { x: 0, y: 0 };
    const isActivatable = node.kind !== "terminal" && Boolean(onActivateNode);
    return {
      id: node.id,
      type: node.kind,
      position,
      draggable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      data: {
        label: node.label,
        order: node.order,
        conditional: node.conditional,
        conditionalStepIds: node.conditionalStepIds,
        onActivate: isActivatable ? () => onActivateNode?.(node) : undefined,
      },
    };
  });
}

export function toFlowEdges(edges: WorkflowMapEdge[]): MapFlowEdge[] {
  return edges.map((edge) => {
    const isSkip = edge.kind === "skip";
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: isSkip ? "smoothstep" : "straight",
      label: isSkip ? "Skip" : undefined,
      focusable: false,
      deletable: false,
      reconnectable: false,
      className: isSkip ? SKIP_EDGE_CLASS : SEQUENTIAL_EDGE_CLASS,
      style: {
        stroke: isSkip ? "var(--map-skip-line)" : "var(--map-line)",
        strokeWidth: 2,
        strokeDasharray: isSkip ? "6 4" : undefined,
      },
      labelBgStyle: isSkip ? { fill: "var(--map-skip-bg)" } : undefined,
      labelStyle: isSkip ? { fill: "var(--map-skip-fg)", fontWeight: 600, fontSize: 11 } : undefined,
      labelBgPadding: isSkip ? [4, 2] : undefined,
      labelBgBorderRadius: isSkip ? 4 : undefined,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isSkip ? "var(--map-skip-line)" : "var(--map-line-arrow)",
      },
    };
  });
}
