import { describe, expect, it } from "vitest";

import { computeSimulationHighlight } from "@/components/builder/map/simulationHighlight";
import type { WorkflowMapEdge } from "@shared/workflowMap";
import type { SimulatedPath } from "@shared/workflowSimulation";

function simulatedPath(overrides: Partial<SimulatedPath>): SimulatedPath {
  return { visited: [], notVisited: [], traversedEdges: [], truncated: false, ...overrides };
}

describe("computeSimulationHighlight (MAP-8 AC3)", () => {
  it("marks every visited page on-path, and reports no off-path nodes for a fully-visited linear graph", () => {
    const simulation = simulatedPath({
      visited: ["page-a", "page-b", "page-c"],
      traversedEdges: [
        "sequential:page-a->page-b",
        "sequential:page-b->page-c",
        "sequential:page-c->__complete__",
      ],
    });
    const edges: WorkflowMapEdge[] = [
      { id: "sequential:page-a->page-b", from: "page-a", to: "page-b", kind: "sequential" },
      { id: "sequential:page-b->page-c", from: "page-b", to: "page-c", kind: "sequential" },
      { id: "sequential:page-c->__complete__", from: "page-c", to: "__complete__", kind: "sequential" },
    ];
    const nodeIds = ["page-a", "page-b", "page-c", "__complete__"];

    const result = computeSimulationHighlight(simulation, nodeIds, edges);

    expect(result.onPathNodeIds).toEqual(new Set(nodeIds));
    expect(result.hasOffPathNodes).toBe(false);
  });

  it("puts the terminal node and a final_documents step on-path via their traversed edges, even though neither is ever pushed to `visited`", () => {
    const simulation = simulatedPath({
      visited: ["page-a"],
      traversedEdges: ["sequential:page-a->step-doc", "sequential:step-doc->__complete__"],
    });
    const edges: WorkflowMapEdge[] = [
      { id: "sequential:page-a->step-doc", from: "page-a", to: "step-doc", kind: "sequential" },
      { id: "sequential:step-doc->__complete__", from: "step-doc", to: "__complete__", kind: "sequential" },
    ];
    const nodeIds = ["page-a", "step-doc", "__complete__"];

    const result = computeSimulationHighlight(simulation, nodeIds, edges);

    expect(result.onPathNodeIds).toEqual(new Set(["page-a", "step-doc", "__complete__"]));
    expect(result.hasOffPathNodes).toBe(false);
  });

  it("flags a skipped page as off-path when a forward skip bypasses it", () => {
    const simulation = simulatedPath({
      visited: ["page-c"],
      traversedEdges: ["skip:rule-skip-forward", "sequential:page-c->__complete__"],
    });
    const edges: WorkflowMapEdge[] = [
      { id: "sequential:page-a->page-b", from: "page-a", to: "page-b", kind: "sequential" },
      { id: "sequential:page-b->page-c", from: "page-b", to: "page-c", kind: "sequential" },
      { id: "skip:rule-skip-forward", from: "page-a", to: "page-c", kind: "skip", ruleId: "rule-skip-forward" },
      { id: "sequential:page-c->__complete__", from: "page-c", to: "__complete__", kind: "sequential" },
    ];
    const nodeIds = ["page-a", "page-b", "page-c", "__complete__"];

    const result = computeSimulationHighlight(simulation, nodeIds, edges);

    // page-a is the origin of the winning skip edge, so it's on-path; page-b is skipped over.
    expect(result.onPathNodeIds.has("page-a")).toBe(true);
    expect(result.onPathNodeIds.has("page-b")).toBe(false);
    expect(result.onPathNodeIds.has("page-c")).toBe(true);
    expect(result.onPathEdgeIds.has("skip:rule-skip-forward")).toBe(true);
    expect(result.onPathEdgeIds.has("sequential:page-a->page-b")).toBe(false);
    expect(result.hasOffPathNodes).toBe(true);
  });
});
