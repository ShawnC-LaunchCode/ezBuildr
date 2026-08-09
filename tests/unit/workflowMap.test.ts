import { describe, it, expect } from "vitest";

import { buildWorkflowMap, WORKFLOW_MAP_TERMINAL_NODE_ID } from "@shared/workflowMap";
import {
  linearThreeSections,
  workflowWithBackwardSkip,
  workflowWithConditionalSection,
  workflowWithDanglingSkipTarget,
  workflowWithFinalDocuments,
  workflowWithForwardSkip,
  workflowWithUnreachableSection,
} from "../fixtures/workflowMap";

describe("buildWorkflowMap", () => {
  describe("AC2 — section ordering", () => {
    it("orders section nodes by `order`, not by input array position", () => {
      const { nodes } = buildWorkflowMap(linearThreeSections());
      const sectionNodes = nodes.filter((n) => n.kind === "section");
      expect(sectionNodes.map((n) => n.id)).toEqual(["section-a", "section-b", "section-c"]);
      expect(sectionNodes.map((n) => n.order)).toEqual([0, 1, 2]);
    });

    it("connects consecutive sections with sequential edges, in order", () => {
      const { edges } = buildWorkflowMap(linearThreeSections());
      const sequential = edges.filter((e) => e.kind === "sequential");
      expect(sequential).toEqual([
        { id: "sequential:section-a->section-b", from: "section-a", to: "section-b", kind: "sequential" },
        { id: "sequential:section-b->section-c", from: "section-b", to: "section-c", kind: "sequential" },
        {
          id: `sequential:section-c->${WORKFLOW_MAP_TERMINAL_NODE_ID}`,
          from: "section-c",
          to: WORKFLOW_MAP_TERMINAL_NODE_ID,
          kind: "sequential",
        },
      ]);
    });
  });

  describe("AC3 — final_documents node and the terminal node", () => {
    it("adds a final_documents node in addition to its section's node", () => {
      const { nodes } = buildWorkflowMap(workflowWithFinalDocuments());
      const sectionNode = nodes.find((n) => n.id === "section-a");
      const docNode = nodes.find((n) => n.id === "step-doc");
      expect(sectionNode).toBeDefined();
      expect(sectionNode?.kind).toBe("section");
      expect(docNode).toBeDefined();
      expect(docNode?.kind).toBe("final_documents");
    });

    it("draws a sequential edge from the section to its final_documents node", () => {
      const { edges } = buildWorkflowMap(workflowWithFinalDocuments());
      expect(edges).toContainEqual({
        id: "sequential:section-a->step-doc",
        from: "section-a",
        to: "step-doc",
        kind: "sequential",
      });
    });

    it("emits exactly one terminal node, id __complete__, regardless of how many sections or documents exist", () => {
      const { nodes } = buildWorkflowMap(workflowWithFinalDocuments());
      const terminalNodes = nodes.filter((n) => n.kind === "terminal");
      expect(terminalNodes).toHaveLength(1);
      expect(terminalNodes[0].id).toBe(WORKFLOW_MAP_TERMINAL_NODE_ID);
    });

    it("gives the final_documents node its own outgoing sequential edge to the terminal node", () => {
      // Documents are an ending too — without this edge, `step-doc` would have
      // zero outgoing edges and MAP-3's analyzeWorkflowFlow would flag every
      // workflow with final documents as a publish-blocking dead end.
      const { edges } = buildWorkflowMap(workflowWithFinalDocuments());
      expect(edges).toContainEqual({
        id: `sequential:step-doc->${WORKFLOW_MAP_TERMINAL_NODE_ID}`,
        from: "step-doc",
        to: WORKFLOW_MAP_TERMINAL_NODE_ID,
        kind: "sequential",
      });
    });

    it("leaves the terminal node as the only node with zero outgoing edges", () => {
      // Run against workflowWithFinalDocuments(), not a linear fixture — a
      // linear workflow has no final_documents node, so this assertion would
      // pass trivially there and miss the exact dead-end regression this
      // guards against.
      const { nodes, edges } = buildWorkflowMap(workflowWithFinalDocuments());
      const outgoingCount = new Map<string, number>(nodes.map((n) => [n.id, 0]));
      for (const edge of edges) {
        outgoingCount.set(edge.from, (outgoingCount.get(edge.from) ?? 0) + 1);
      }
      const nodesWithNoOutgoingEdge = nodes
        .filter((n) => (outgoingCount.get(n.id) ?? 0) === 0)
        .map((n) => n.id);
      expect(nodesWithNoOutgoingEdge).toEqual([WORKFLOW_MAP_TERMINAL_NODE_ID]);
    });
  });

  describe("AC4 — skip_to edges", () => {
    it("yields one skip edge carrying the rule's id for a forward skip_to rule", () => {
      const { edges } = buildWorkflowMap(workflowWithForwardSkip());
      const skipEdges = edges.filter((e) => e.kind === "skip");
      expect(skipEdges).toHaveLength(1);
      expect(skipEdges[0]).toEqual({
        id: "skip:rule-skip-forward",
        from: "section-a",
        to: "section-c",
        kind: "skip",
        ruleId: "rule-skip-forward",
      });
    });

    it("still draws a skip edge for a backward skip_to rule (a runtime no-op, but a real edge in the graph model)", () => {
      const { edges } = buildWorkflowMap(workflowWithBackwardSkip());
      const skipEdges = edges.filter((e) => e.kind === "skip");
      expect(skipEdges).toHaveLength(1);
      expect(skipEdges[0]).toEqual({
        id: "skip:rule-skip-backward",
        from: "section-c",
        to: "section-a",
        kind: "skip",
        ruleId: "rule-skip-backward",
      });
    });

    it("produces no edge at all for a skip_to rule whose target resolves to no known section", () => {
      const input = workflowWithDanglingSkipTarget();
      // Sanity check this fixture actually exercises the dangling case, not an empty rules array.
      expect(input.rules).toHaveLength(1);
      expect(input.sections.some((s) => s.id === input.rules[0].targetSectionId)).toBe(false);

      const { edges } = buildWorkflowMap(input);
      expect(edges.filter((e) => e.kind === "skip")).toEqual([]);
    });
  });

  describe("AC5 — conditional flag", () => {
    it("marks a section with a non-null visibleIf as conditional", () => {
      const { nodes } = buildWorkflowMap(workflowWithConditionalSection());
      const sectionA = nodes.find((n) => n.id === "section-a");
      expect(sectionA?.conditional).toBe(true);
    });

    it("marks a section targeted by a hide rule as conditional, even with no visibleIf of its own", () => {
      const { nodes } = buildWorkflowMap(workflowWithUnreachableSection());
      const sectionB = nodes.find((n) => n.id === "section-b");
      expect(sectionB?.conditional).toBe(true);
    });

    it("leaves a section with neither a visibleIf nor a targeting rule as not conditional", () => {
      const { nodes } = buildWorkflowMap(workflowWithConditionalSection());
      const sectionB = nodes.find((n) => n.id === "section-b");
      expect(sectionB?.conditional).toBe(false);
    });

    it("lists steps with their own visibleIf in conditionalStepIds, and excludes unconditional steps", () => {
      const { nodes } = buildWorkflowMap(workflowWithConditionalSection());
      const sectionA = nodes.find((n) => n.id === "section-a");
      expect(sectionA?.conditionalStepIds).toEqual(["step-a-cond"]);
    });
  });
});
