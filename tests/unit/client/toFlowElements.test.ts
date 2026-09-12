import { describe, expect, it, vi } from "vitest";

import {
  SEQUENTIAL_EDGE_CLASS,
  SKIP_EDGE_CLASS,
  toFlowEdges,
  toFlowNodes,
} from "@/components/builder/map/toFlowElements";
import { buildWorkflowMap } from "@shared/workflowMap";

import {
  linearThreePages,
  workflowWithConditionalPage,
  workflowWithForwardSkip,
} from "../../fixtures/workflowMap";

describe("toFlowNodes / toFlowEdges (MAP-4)", () => {
  it("marks every node non-draggable, non-connectable and non-deletable (AC6, belt-and-suspenders with the ReactFlow-level props)", () => {
    const { nodes, edges } = buildWorkflowMap(workflowWithConditionalPage());
    const flowNodes = toFlowNodes(nodes, edges);

    expect(flowNodes.length).toBeGreaterThan(0);
    for (const node of flowNodes) {
      expect(node.draggable).toBe(false);
      expect(node.connectable).toBe(false);
      expect(node.deletable).toBe(false);
    }
  });

  it("carries a node's `conditional` flag straight through into its flow data", () => {
    const { nodes, edges } = buildWorkflowMap(workflowWithConditionalPage());
    const flowNodes = toFlowNodes(nodes, edges);

    const pageA = flowNodes.find((n) => n.id === "page-a");
    const pageB = flowNodes.find((n) => n.id === "page-b");
    expect(pageA?.data.conditional).toBe(true);
    expect(pageB?.data.conditional).toBe(false);
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

  it("routes a skip edge through the dedicated left-side anchors with a wide enough offset to clear a bypassed page (review fix)", () => {
    const { edges } = buildWorkflowMap(workflowWithForwardSkip());
    const flowEdges = toFlowEdges(edges);
    const skipEdge = flowEdges.find((e) => e.id.startsWith("skip:"));
    const sequentialEdge = flowEdges.find((e) => e.id.startsWith("sequential:"));

    // Regression: a defect found at review had this edge using the node's
    // default top/bottom handles (same as a sequential edge), which drew a
    // straight line directly through the bypassed page with the "Skip"
    // label rendered on top of that node's own title.
    expect(skipEdge?.sourceHandle).toBe("skip-source");
    expect(skipEdge?.targetHandle).toBe("skip-target");
    expect(skipEdge?.type).toBe("smoothstep");
    expect(skipEdge?.type === "smoothstep" ? skipEdge.pathOptions?.offset : undefined).toBeGreaterThanOrEqual(50);

    // A sequential edge must keep using the original, unnamed handles — it
    // never sets sourceHandle/targetHandle at all.
    expect(sequentialEdge?.sourceHandle).toBeUndefined();
    expect(sequentialEdge?.targetHandle).toBeUndefined();
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

  it("wires an onActivate callback for every non-terminal node when one is supplied (MAP-5)", () => {
    const { nodes, edges } = buildWorkflowMap(linearThreePages());
    const onActivateNode = vi.fn();
    const flowNodes = toFlowNodes(nodes, edges, onActivateNode);

    const pageA = flowNodes.find((n) => n.id === "page-a");
    expect(pageA?.data.onActivate).toBeTypeOf("function");
    pageA?.data.onActivate?.();
    expect(onActivateNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "page-a", kind: "page" })
    );
  });

  it("never gives the terminal node an onActivate callback, even when one is supplied (MAP-5 AC3)", () => {
    const { nodes, edges } = buildWorkflowMap(linearThreePages());
    const onActivateNode = vi.fn();
    const flowNodes = toFlowNodes(nodes, edges, onActivateNode);

    const terminal = flowNodes.find((n) => n.id === "__complete__");
    expect(terminal?.data.onActivate).toBeUndefined();
  });

  it("leaves every node non-focusable at the xyflow level — the node's own button handles keyboard activation (MAP-5)", () => {
    const { nodes, edges } = buildWorkflowMap(linearThreePages());
    const flowNodes = toFlowNodes(nodes, edges, vi.fn());

    for (const node of flowNodes) {
      expect(node.focusable).toBe(false);
    }
  });
});
