import { describe, expect, it } from "vitest";

import { computeSimulationHighlight } from "@/components/builder/map/simulationHighlight";
import type { WorkflowMapEdge } from "@shared/workflowMap";
import type { SimulatedPath } from "@shared/workflowSimulation";

function simulatedPath(overrides: Partial<SimulatedPath>): SimulatedPath {
  return { visited: [], notVisited: [], traversedEdges: [], truncated: false, ...overrides };
}

describe("computeSimulationHighlight (MAP-8 AC3)", () => {
  it("marks every visited section on-path, and reports no off-path nodes for a fully-visited linear graph", () => {
    const simulation = simulatedPath({
      visited: ["section-a", "section-b", "section-c"],
      traversedEdges: [
        "sequential:section-a->section-b",
        "sequential:section-b->section-c",
        "sequential:section-c->__complete__",
      ],
    });
    const edges: WorkflowMapEdge[] = [
      { id: "sequential:section-a->section-b", from: "section-a", to: "section-b", kind: "sequential" },
      { id: "sequential:section-b->section-c", from: "section-b", to: "section-c", kind: "sequential" },
      { id: "sequential:section-c->__complete__", from: "section-c", to: "__complete__", kind: "sequential" },
    ];
    const nodeIds = ["section-a", "section-b", "section-c", "__complete__"];

    const result = computeSimulationHighlight(simulation, nodeIds, edges);

    expect(result.onPathNodeIds).toEqual(new Set(nodeIds));
    expect(result.hasOffPathNodes).toBe(false);
  });

  it("puts the terminal node and a final_documents step on-path via their traversed edges, even though neither is ever pushed to `visited`", () => {
    const simulation = simulatedPath({
      visited: ["section-a"],
      traversedEdges: ["sequential:section-a->step-doc", "sequential:step-doc->__complete__"],
    });
    const edges: WorkflowMapEdge[] = [
      { id: "sequential:section-a->step-doc", from: "section-a", to: "step-doc", kind: "sequential" },
      { id: "sequential:step-doc->__complete__", from: "step-doc", to: "__complete__", kind: "sequential" },
    ];
    const nodeIds = ["section-a", "step-doc", "__complete__"];

    const result = computeSimulationHighlight(simulation, nodeIds, edges);

    expect(result.onPathNodeIds).toEqual(new Set(["section-a", "step-doc", "__complete__"]));
    expect(result.hasOffPathNodes).toBe(false);
  });

  it("flags a skipped section as off-path when a forward skip bypasses it", () => {
    const simulation = simulatedPath({
      visited: ["section-c"],
      traversedEdges: ["skip:rule-skip-forward", "sequential:section-c->__complete__"],
    });
    const edges: WorkflowMapEdge[] = [
      { id: "sequential:section-a->section-b", from: "section-a", to: "section-b", kind: "sequential" },
      { id: "sequential:section-b->section-c", from: "section-b", to: "section-c", kind: "sequential" },
      { id: "skip:rule-skip-forward", from: "section-a", to: "section-c", kind: "skip", ruleId: "rule-skip-forward" },
      { id: "sequential:section-c->__complete__", from: "section-c", to: "__complete__", kind: "sequential" },
    ];
    const nodeIds = ["section-a", "section-b", "section-c", "__complete__"];

    const result = computeSimulationHighlight(simulation, nodeIds, edges);

    // section-a is the origin of the winning skip edge, so it's on-path; section-b is skipped over.
    expect(result.onPathNodeIds.has("section-a")).toBe(true);
    expect(result.onPathNodeIds.has("section-b")).toBe(false);
    expect(result.onPathNodeIds.has("section-c")).toBe(true);
    expect(result.onPathEdgeIds.has("skip:rule-skip-forward")).toBe(true);
    expect(result.onPathEdgeIds.has("sequential:section-a->section-b")).toBe(false);
    expect(result.hasOffPathNodes).toBe(true);
  });
});
