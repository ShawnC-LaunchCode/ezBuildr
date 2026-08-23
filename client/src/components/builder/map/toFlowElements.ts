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
 *
 * MAP-8: both functions take an optional set of on-path ids
 * (`simulationHighlight.ts`'s `computeSimulationHighlight`). Omitted (the
 * default), every node/edge renders exactly as before — `MapTab` only passes
 * a set when there's a real on/off-path distinction to draw (see that
 * function's `hasOffPathNodes`).
 *
 * MAP-8 review fix: a skip edge's `source`/`target` are the same page
 * *column* the sequential spine already occupies (`mapLayout.ts` places
 * every page at the same x) — routing it through the default top/bottom
 * handles drew a straight vertical line directly through whatever page it
 * bypassed, with the "Skip" label rendered on top of that node's own title.
 * Skip edges now route through `PageMapNode`'s dedicated left-side
 * anchors (`skip-source`/`skip-target`) with a `smoothstep` `pathOptions.offset`
 * wide enough to clear the card, so the path (and its label) run down a
 * lane beside the spine instead of through it.
 */
import { MarkerType } from "@xyflow/react";

import type { WorkflowMapEdge, WorkflowMapNode } from "@shared/workflowMap";
import type { WorkflowLintIssue } from "@shared/types/workflowLint";

import { computeMapLayout } from "./mapLayout";
import type { MapFlowEdge, MapFlowNode } from "./types";

/** Class names carry the edge-kind distinction into the DOM for tests and CSS — never color alone (MAP-4 AC4/AC7). */
export const SEQUENTIAL_EDGE_CLASS = "workflow-map-edge-sequential";
export const SKIP_EDGE_CLASS = "workflow-map-edge-skip";
/** MAP-8: carries the simulation on/off-path distinction into the DOM, same discipline as the edge-kind classes above. */
export const ONPATH_EDGE_CLASS = "workflow-map-edge-onpath";
export const DIMMED_EDGE_CLASS = "workflow-map-edge-dimmed";

/** The ids of `PageMapNode`'s dedicated skip-routing anchors — see the module doc comment. */
const SKIP_SOURCE_HANDLE = "skip-source";
const SKIP_TARGET_HANDLE = "skip-target";
/** How far the path jogs sideways off the spine before turning — wide enough to clear a `PageMapNode` card (`min-w-[200px] max-w-[240px]`) with visible margin, not just its border. */
const SKIP_EDGE_OFFSET = 70;

export function toFlowNodes(
  nodes: WorkflowMapNode[],
  edges: WorkflowMapEdge[],
  onActivateNode?: (node: WorkflowMapNode) => void,
  /** MAP-6: lint findings grouped by node id (`mapLintDecoration.ts`). Defaults to none so every existing caller keeps working. */
  findingsByPage?: ReadonlyMap<string, WorkflowLintIssue[]>,
  /** MAP-8: node ids the current simulation actually visits. Undefined means "no simulation distinction to draw" — see the module doc comment. */
  onPathNodeIds?: ReadonlySet<string>
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
        findings: findingsByPage?.get(node.id) ?? [],
        simulation: onPathNodeIds ? { onPath: onPathNodeIds.has(node.id) } : undefined,
      },
    };
  });
}

/** The edge-kind + simulation-state combination a single flow edge renders from — split out of `toFlowEdges` so that function's `.map` callback stays simple (the combined branching tripped the complexity lint rule). */
function buildEdgeClassName(isSkip: boolean, onPath: boolean, dimmed: boolean): string {
  return [
    isSkip ? SKIP_EDGE_CLASS : SEQUENTIAL_EDGE_CLASS,
    onPath ? ONPATH_EDGE_CLASS : "",
    dimmed ? DIMMED_EDGE_CLASS : "",
  ].filter(Boolean).join(" ");
}

function toFlowEdge(edge: WorkflowMapEdge, onPath: boolean, dimmed: boolean): MapFlowEdge {
  const isSkip = edge.kind === "skip";
  const lineColor = dimmed ? "var(--map-dim-line)" : isSkip ? "var(--map-skip-line)" : "var(--map-line)";
  const arrowColor = dimmed ? "var(--map-dim-line)" : isSkip ? "var(--map-skip-line)" : "var(--map-line-arrow)";

  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    // Skip edges use the dedicated left-side anchors so the path can jog
    // around whatever it bypasses; sequential edges are left unset, which
    // falls back to the original top/bottom pair (xyflow uses the first
    // handle of the matching type when no id is given).
    sourceHandle: isSkip ? SKIP_SOURCE_HANDLE : undefined,
    targetHandle: isSkip ? SKIP_TARGET_HANDLE : undefined,
    type: isSkip ? "smoothstep" : "straight",
    pathOptions: isSkip ? { offset: SKIP_EDGE_OFFSET } : undefined,
    label: isSkip ? "Skip" : undefined,
    focusable: false,
    deletable: false,
    reconnectable: false,
    className: buildEdgeClassName(isSkip, onPath, dimmed),
    style: {
      stroke: lineColor,
      strokeWidth: onPath ? 3 : 2,
      strokeDasharray: isSkip ? "6 4" : undefined,
      opacity: dimmed ? 0.35 : 1,
    },
    labelBgStyle: isSkip ? { fill: dimmed ? "var(--map-dim-bg)" : "var(--map-skip-bg)" } : undefined,
    labelStyle: isSkip
      ? { fill: dimmed ? "var(--map-dim-fg)" : "var(--map-skip-fg)", fontWeight: 600, fontSize: 11 }
      : undefined,
    labelBgPadding: isSkip ? [4, 2] : undefined,
    labelBgBorderRadius: isSkip ? 4 : undefined,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: arrowColor,
    },
  };
}

export function toFlowEdges(
  edges: WorkflowMapEdge[],
  /** MAP-8: edge ids the current simulation traverses. Undefined means "no simulation distinction to draw". */
  onPathEdgeIds?: ReadonlySet<string>
): MapFlowEdge[] {
  const simulationActive = onPathEdgeIds !== undefined;

  return edges.map((edge) => {
    const onPath = simulationActive && onPathEdgeIds.has(edge.id);
    const dimmed = simulationActive && !onPath;
    return toFlowEdge(edge, onPath, dimmed);
  });
}
