/**
 * Deterministic top-to-bottom layout for the workflow map (MAP-4).
 *
 * Pure and framework-agnostic — no `@xyflow/react` import — so it unit-tests
 * directly against `shared/workflowMap.ts` node/edge arrays. Per D-4 the map
 * is read-only: positions are always *derived* from `node.order`, never
 * persisted, so this function is the only source of node position and it
 * must be a pure function of its inputs.
 *
 * Sections form the vertical "spine" (in `order`), followed by the terminal
 * node. A `final_documents` node is a branch off its owning section — found
 * via its incoming sequential edge, since D-2 makes it an *additional* node
 * downstream of that section, not a replacement for it. A linear chain like
 * this needs no layout library (`dagre`/`elk` — see MAP-4 Preferred fix).
 */
import type { WorkflowMapEdge, WorkflowMapNode } from "@shared/workflowMap";

export interface MapPosition {
  x: number;
  y: number;
}

const ROW_HEIGHT = 150;
const SPINE_X = 260;
const BRANCH_OFFSET_X = 320;

export function computeMapLayout(
  nodes: WorkflowMapNode[],
  edges: WorkflowMapEdge[]
): Record<string, MapPosition> {
  const positions: Record<string, MapPosition> = {};

  // The spine: every node except the `final_documents` branches, in `order`.
  const spineNodes = [...nodes]
    .filter((node) => node.kind !== "final_documents")
    .sort((a, b) => a.order - b.order);

  spineNodes.forEach((node, index) => {
    positions[node.id] = { x: SPINE_X, y: index * ROW_HEIGHT };
  });

  // Branches: placed beside the section whose sequential edge leads to them,
  // at that section's row. A branch whose owner can't be found (shouldn't
  // happen given how buildWorkflowMap constructs these edges) falls back to
  // its own row rather than colliding with the spine at (0, 0).
  const branchNodes = nodes.filter((node) => node.kind === "final_documents");
  branchNodes.forEach((node, index) => {
    const incoming = edges.find((edge) => edge.kind === "sequential" && edge.to === node.id);
    const owner = incoming ? positions[incoming.from] : undefined;
    positions[node.id] = {
      x: SPINE_X + BRANCH_OFFSET_X,
      y: owner ? owner.y : (spineNodes.length + index) * ROW_HEIGHT,
    };
  });

  return positions;
}
