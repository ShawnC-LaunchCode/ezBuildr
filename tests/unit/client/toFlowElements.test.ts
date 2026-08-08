import { describe, expect, it } from "vitest";

import {
  SEQUENTIAL_EDGE_CLASS,
  SKIP_EDGE_CLASS,
  toFlowEdges,
  toFlowNodes,
} from "@/components/builder/map/toFlowElements";
import { buildWorkflowMap } from "@shared/workflowMap";

import {
  workflowWithConditionalSection,
  workflowWithForwardSkip,
} from "../../fixtures/workflowMap";

describe("toFlowNodes / toFlowEdges (MAP-4)", () => {
  it("marks every node non-draggable, non-connectable and non-deletable (AC6, belt-and-suspenders with the ReactFlow-level props)", () => {
    const { nodes, edges } = buildWorkflowMap(workflowWithConditionalSection());
    const flowNodes = toFlowNodes(nodes, edges);

    expect(flowNodes.length).toBeGreaterThan(0);
    for (const node of flowNodes) {
      expect(node.draggable).toBe(false);
      expect(node.connectable).toBe(false);
      expect(node.deletable).toBe(false);
    }
  });

  it("carries a node's `conditional` flag straight through into its flow data", () => {
    const { nodes, edges } = buildWorkflowMap(workflowWithConditionalSection());
    const flowNodes = toFlowNodes(nodes, edges);

    const sectionA = flowNodes.find((n) => n.id === "section-a");
    const sectionB = flowNodes.find((n) => n.id === "section-b");
    expect(sectionA?.data.conditional).toBe(true);
    expect(sectionB?.data.conditional).toBe(false);
  });

  it("gives skip edges a distinct class and label from sequential edges (AC4)", () => {
    const { edges } = buildWorkflowMap(workflowWithForwardSkip());
    const flowEdges = toFlowEdges(edges);

    const skipEdge = flowEdges.find((e) => e.id.startsWith("skip:"));
    const sequentialEdge = flowEdges.find((e) => e.id.startsWith("sequential:"));

    expect(skipEdge?.className).toBe(SKIP_EDGE_CLASS);
    expect(skipEdge?.label).toBe("Skip");
    expect(sequentialEdge?.className).toBe(SEQUENTIAL_EDGE_CLASS);
    expect(sequentialEdge?.label).toBeUndefined();
    expect(skipEdge?.className).not.toBe(sequentialEdge?.className);
  });

  it("makes every edge non-focusable, non-deletable and non-reconnectable (read-only per D-4)", () => {
    const { edges } = buildWorkflowMap(workflowWithForwardSkip());
    const flowEdges = toFlowEdges(edges);

    expect(flowEdges.length).toBeGreaterThan(0);
    for (const edge of flowEdges) {
      expect(edge.focusable).toBe(false);
      expect(edge.deletable).toBe(false);
      expect(edge.reconnectable).toBe(false);
    }
  });
});
