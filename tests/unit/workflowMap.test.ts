import { describe, it, expect } from "vitest";

import { buildWorkflowMap, WORKFLOW_MAP_TERMINAL_NODE_ID } from "@shared/workflowMap";
import {
  linearThreePages,
  workflowWithBackwardSkip,
  workflowWithConditionalPage,
  workflowWithDanglingSkipTarget,
  workflowWithFinalDocuments,
  workflowWithForwardSkip,
  workflowWithUnreachablePage,
} from "../fixtures/workflowMap";

describe("buildWorkflowMap", () => {
  describe("AC2 — page ordering", () => {
    it("orders page nodes by `order`, not by input array position", () => {
      const { nodes } = buildWorkflowMap(linearThreePages());
      const pageNodes = nodes.filter((n) => n.kind === "page");
      expect(pageNodes.map((n) => n.id)).toEqual(["page-a", "page-b", "page-c"]);
      expect(pageNodes.map((n) => n.order)).toEqual([0, 1, 2]);
    });

    it("connects consecutive pages with sequential edges, in order", () => {
      const { edges } = buildWorkflowMap(linearThreePages());
      const sequential = edges.filter((e) => e.kind === "sequential");
      expect(sequential).toEqual([
        { id: "sequential:page-a->page-b", from: "page-a", to: "page-b", kind: "sequential" },
        { id: "sequential:page-b->page-c", from: "page-b", to: "page-c", kind: "sequential" },
        {
          id: `sequential:page-c->${WORKFLOW_MAP_TERMINAL_NODE_ID}`,
          from: "page-c",
          to: WORKFLOW_MAP_TERMINAL_NODE_ID,
          kind: "sequential",
        },
      ]);
    });
  });

  describe("AC3 — final_documents node and the terminal node", () => {
    it("adds a final_documents node in addition to its page's node", () => {
      const { nodes } = buildWorkflowMap(workflowWithFinalDocuments());
      const pageNode = nodes.find((n) => n.id === "page-a");
      const docNode = nodes.find((n) => n.id === "step-doc");
      expect(pageNode).toBeDefined();
      expect(pageNode?.kind).toBe("page");
      expect(docNode).toBeDefined();
      expect(docNode?.kind).toBe("final_documents");
    });

    it("draws a sequential edge from the page to its final_documents node", () => {
      const { edges } = buildWorkflowMap(workflowWithFinalDocuments());
      expect(edges).toContainEqual({
        id: "sequential:page-a->step-doc",
        from: "page-a",
        to: "step-doc",
        kind: "sequential",
      });
    });

    it("emits exactly one terminal node, id __complete__, regardless of how many pages or documents exist", () => {
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
        from: "page-a",
        to: "page-c",
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
        from: "page-c",
        to: "page-a",
        kind: "skip",
        ruleId: "rule-skip-backward",
      });
    });

    it("produces no edge at all for a skip_to rule whose target resolves to no known page", () => {
      const input = workflowWithDanglingSkipTarget();
      // Sanity check this fixture actually exercises the dangling case, not an empty rules array.
      expect(input.rules).toHaveLength(1);
      expect(input.pages.some((s) => s.id === input.rules[0].targetPageId)).toBe(false);

      const { edges } = buildWorkflowMap(input);
      expect(edges.filter((e) => e.kind === "skip")).toEqual([]);
    });
  });

  describe("AC5 — conditional flag", () => {
    it("propagates a conditional Section to member page and final-document nodes", () => {
      const { nodes } = buildWorkflowMap({
        sections: [{ id: "section-1", visibleIf: { type: "group", conditions: [{ type: "condition", variable: "earlier" }] } }],
        pages: [{ id: "page-a", sectionId: "section-1", title: "Documents", order: 0 }],
        steps: [{ id: "final", pageId: "page-a", type: "final_documents", title: "Final documents" }],
        rules: [],
      });

      expect(nodes.find((node) => node.id === "page-a")?.conditional).toBe(true);
      expect(nodes.find((node) => node.id === "final")?.conditional).toBe(true);
    });

    it("does not mark member nodes conditional for null or empty Section conditions", () => {
      const { nodes } = buildWorkflowMap({
        sections: [
          { id: "null-section", visibleIf: null },
          { id: "empty-section", visibleIf: { type: "group", conditions: [] } },
        ],
        pages: [
          { id: "null-member", sectionId: "null-section", title: "Null", order: 0 },
          { id: "empty-member", sectionId: "empty-section", title: "Empty", order: 1 },
          { id: "ungrouped", sectionId: null, title: "Ungrouped", order: 2 },
        ],
        steps: [],
        rules: [],
      });

      expect(nodes.filter((node) => node.kind === "page").map((node) => node.conditional)).toEqual([false, false, false]);
    });

    it("marks a page with a non-null visibleIf as conditional", () => {
      const { nodes } = buildWorkflowMap(workflowWithConditionalPage());
      const pageA = nodes.find((n) => n.id === "page-a");
      expect(pageA?.conditional).toBe(true);
    });

    it("marks a page targeted by a hide rule as conditional, even with no visibleIf of its own", () => {
      const { nodes } = buildWorkflowMap(workflowWithUnreachablePage());
      const pageB = nodes.find((n) => n.id === "page-b");
      expect(pageB?.conditional).toBe(true);
    });

    it("leaves a page with neither a visibleIf nor a targeting rule as not conditional", () => {
      const { nodes } = buildWorkflowMap(workflowWithConditionalPage());
      const pageB = nodes.find((n) => n.id === "page-b");
      expect(pageB?.conditional).toBe(false);
    });

    it("lists steps with their own visibleIf in conditionalStepIds, and excludes unconditional steps", () => {
      const { nodes } = buildWorkflowMap(workflowWithConditionalPage());
      const pageA = nodes.find((n) => n.id === "page-a");
      expect(pageA?.conditionalStepIds).toEqual(["step-a-cond"]);
    });
  });
});
