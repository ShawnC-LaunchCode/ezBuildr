import { describe, it, expect } from "vitest";

import {
  analyzeWorkflowFlow,
  buildConditionDependencyGraph,
  detectCycles,
  detectDanglingReferences,
  extractConditionReferences,
  type WorkflowFlowEdge,
  type WorkflowFlowNode,
} from "@shared/conditionGraph";
import type { ConditionExpression } from "@shared/types/conditions";

/** Build a minimal ConditionExpression referencing `variable`. */
function refExpr(variable: string): ConditionExpression {
  return {
    type: "group",
    id: "g1",
    operator: "AND",
    conditions: [
      { type: "condition", id: "c1", variable, operator: "is_true", value: true, valueType: "constant" },
    ],
  };
}

describe("conditionGraph", () => {
  describe("extractConditionReferences", () => {
    it("returns no references for a null/undefined expression", () => {
      expect(extractConditionReferences(null)).toEqual([]);
      expect(extractConditionReferences(undefined)).toEqual([]);
    });

    it("extracts the variable from an object-shaped condition", () => {
      expect(extractConditionReferences(refExpr("has_pet"))).toEqual(["has_pet"]);
    });

    it("extracts variables from nested groups", () => {
      const nested: ConditionExpression = {
        type: "group",
        id: "g1",
        operator: "AND",
        conditions: [
          { type: "condition", id: "c1", variable: "a", operator: "is_true", value: true, valueType: "constant" },
          {
            type: "group",
            id: "g2",
            operator: "OR",
            conditions: [
              { type: "condition", id: "c2", variable: "b", operator: "is_true", value: true, valueType: "constant" },
            ],
          },
        ],
      };
      expect(extractConditionReferences(nested).sort()).toEqual(["a", "b"]);
    });

    it("ignores a raw-string expression (O-4: strings can no longer be stored)", () => {
      // The old string branch pulled identifiers out with a bare regex, which
      // also matched string literals — `name == 'foo'` yielded `foo` as an
      // operand, and LU-3 made unresolvable operands publish-blocking errors.
      expect(extractConditionReferences("has_pet and not is_owner")).toEqual([]);
    });

    it("keeps an operand whose alias collides with a logic keyword", () => {
      // A step legitimately aliased `or` is a real edge; dropping it could
      // hide a cycle.
      expect(
        extractConditionReferences({
          type: "group",
          operator: "AND",
          conditions: [{ type: "condition", variable: "or", operator: "is_true" }],
        })
      ).toEqual(["or"]);
    });
  });

  describe("buildConditionDependencyGraph", () => {
    it("registers every supplied node even with no outgoing edges", () => {
      const graph = buildConditionDependencyGraph([{ id: "a" }, { id: "b", visibleIf: refExpr("a") }]);
      expect(graph.has("a")).toBe(true);
      expect(graph.get("a")).toEqual([]);
      expect(graph.get("b")).toEqual(["a"]);
    });
  });

  describe("detectCycles", () => {
    it("finds no cycle in an acyclic chain", () => {
      const graph = buildConditionDependencyGraph([
        { id: "a" },
        { id: "b", visibleIf: refExpr("a") },
        { id: "c", visibleIf: refExpr("b") },
      ]);
      expect(detectCycles(graph)).toEqual([]);
    });

    it("finds a 2-node cycle (A depends on B, B depends on A)", () => {
      const graph = buildConditionDependencyGraph([
        { id: "a", visibleIf: refExpr("b") },
        { id: "b", visibleIf: refExpr("a") },
      ]);
      const cycles = detectCycles(graph);
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles.some((c) => c.path.includes("a") && c.path.includes("b"))).toBe(true);
    });

    it("finds a 3-node cycle (A -> B -> C -> A)", () => {
      const graph = buildConditionDependencyGraph([
        { id: "a", visibleIf: refExpr("c") },
        { id: "b", visibleIf: refExpr("a") },
        { id: "c", visibleIf: refExpr("b") },
      ]);
      const cycles = detectCycles(graph);
      expect(cycles.length).toBeGreaterThan(0);
      const involved = new Set(cycles.flatMap((c) => c.path));
      expect(involved.has("a")).toBe(true);
      expect(involved.has("b")).toBe(true);
      expect(involved.has("c")).toBe(true);
    });

    it("finds a self-reference cycle (A depends on A)", () => {
      const graph = buildConditionDependencyGraph([{ id: "a", visibleIf: refExpr("a") }]);
      const cycles = detectCycles(graph);
      expect(cycles.length).toBe(1);
      expect(cycles[0].path).toEqual(["a", "a"]);
    });

    it("does NOT flag a diamond dependency as a cycle (A -> B -> D, A -> C -> D)", () => {
      // A's visibleIf references both B and C; B and C each reference D.
      // D is reached twice via two different paths, but there is no cycle.
      const diamond: ConditionExpression = {
        type: "group",
        id: "g1",
        operator: "AND",
        conditions: [
          { type: "condition", id: "c1", variable: "b", operator: "is_true", value: true, valueType: "constant" },
          { type: "condition", id: "c2", variable: "c", operator: "is_true", value: true, valueType: "constant" },
        ],
      };
      const graph = buildConditionDependencyGraph([
        { id: "a", visibleIf: diamond },
        { id: "b", visibleIf: refExpr("d") },
        { id: "c", visibleIf: refExpr("d") },
        { id: "d" },
      ]);
      expect(detectCycles(graph)).toEqual([]);
    });
  });

  describe("detectDanglingReferences", () => {
    it("reports a reference to a node id that was never registered", () => {
      const graph = buildConditionDependencyGraph([{ id: "a", visibleIf: refExpr("ghost") }]);
      const dangling = detectDanglingReferences(graph);
      expect(dangling).toEqual([{ from: "a", to: "ghost" }]);
    });

    it("reports nothing when every reference resolves to a known node", () => {
      const graph = buildConditionDependencyGraph([
        { id: "a" },
        { id: "b", visibleIf: refExpr("a") },
      ]);
      expect(detectDanglingReferences(graph)).toEqual([]);
    });
  });

  describe("analyzeWorkflowFlow (MAP-3)", () => {
    /** A straight A -> B -> C -> terminal chain, no skips. */
    function linearChain(): { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] } {
      const nodes: WorkflowFlowNode[] = [
        { id: "a", kind: "page", order: 0 },
        { id: "b", kind: "page", order: 1 },
        { id: "c", kind: "page", order: 2 },
        { id: "term", kind: "terminal", order: 3 },
      ];
      const edges: WorkflowFlowEdge[] = [
        { id: "e1", from: "a", to: "b", kind: "sequential" },
        { id: "e2", from: "b", to: "c", kind: "sequential" },
        { id: "e3", from: "c", to: "term", kind: "sequential" },
      ];
      return { nodes, edges };
    }

    it("finds no unreachable nodes, no dead ends, and no loops in a linear chain", () => {
      const { nodes, edges } = linearChain();
      const diagnostics = analyzeWorkflowFlow(nodes, edges);
      expect(diagnostics.unreachable).toEqual([]);
      expect(diagnostics.deadEnds).toEqual([]);
      expect(diagnostics.loops).toEqual([]);
    });

    it("reports a node with no inbound edge as unreachable (orphaned by ordering)", () => {
      // "orphan" has the lowest order of the disconnected pair, so it isn't
      // mistaken for the start node either.
      const nodes: WorkflowFlowNode[] = [
        { id: "start", kind: "page", order: 0 },
        { id: "next", kind: "page", order: 1 },
        { id: "orphan", kind: "page", order: 2 },
        { id: "term", kind: "terminal", order: 3 },
      ];
      const edges: WorkflowFlowEdge[] = [
        { id: "e1", from: "start", to: "next", kind: "sequential" },
        { id: "e2", from: "next", to: "term", kind: "sequential" },
        // Nothing points at "orphan".
      ];
      const diagnostics = analyzeWorkflowFlow(nodes, edges);
      expect(diagnostics.unreachable).toEqual(["orphan"]);
    });

    it("reports a non-terminal node with no outgoing edge as a dead end, and never the terminal", () => {
      const nodes: WorkflowFlowNode[] = [
        { id: "a", kind: "page", order: 0 },
        { id: "stuck", kind: "page", order: 1 },
        { id: "term", kind: "terminal", order: 2 },
      ];
      const edges: WorkflowFlowEdge[] = [
        { id: "e1", from: "a", to: "stuck", kind: "sequential" },
        // "stuck" has no outgoing edge at all — nothing connects it onward,
        // not even to the terminal.
      ];
      const diagnostics = analyzeWorkflowFlow(nodes, edges);
      expect(diagnostics.deadEnds).toEqual(["stuck"]);
      expect(diagnostics.deadEnds).not.toContain("term");
    });

    it("reports a skip_to cycle among pages in loops", () => {
      // a(0) -skip-> c(2) [forward] -skip-> b(1) [backward] -skip-> a(0) [backward]
      const nodes: WorkflowFlowNode[] = [
        { id: "a", kind: "page", order: 0 },
        { id: "b", kind: "page", order: 1 },
        { id: "c", kind: "page", order: 2 },
        { id: "term", kind: "terminal", order: 3 },
      ];
      const edges: WorkflowFlowEdge[] = [
        { id: "seq1", from: "a", to: "b", kind: "sequential" },
        { id: "seq2", from: "b", to: "c", kind: "sequential" },
        { id: "seq3", from: "c", to: "term", kind: "sequential" },
        { id: "skip1", from: "a", to: "c", kind: "skip" },
        { id: "skip2", from: "c", to: "b", kind: "skip" },
        { id: "skip3", from: "b", to: "a", kind: "skip" },
      ];
      const diagnostics = analyzeWorkflowFlow(nodes, edges);
      expect(diagnostics.loops.length).toBeGreaterThan(0);
      const involved = new Set(diagnostics.loops.flatMap((loop) => loop.path));
      expect(involved.has("a")).toBe(true);
      expect(involved.has("b")).toBe(true);
      expect(involved.has("c")).toBe(true);
    });

    it("does NOT report a diamond (two forward skips converging on one page) as a loop", () => {
      // a(0) -skip-> d(3), b(1) -skip-> d(3): both forward, converging on d.
      const nodes: WorkflowFlowNode[] = [
        { id: "a", kind: "page", order: 0 },
        { id: "b", kind: "page", order: 1 },
        { id: "c", kind: "page", order: 2 },
        { id: "d", kind: "page", order: 3 },
        { id: "term", kind: "terminal", order: 4 },
      ];
      const edges: WorkflowFlowEdge[] = [
        { id: "seq1", from: "a", to: "b", kind: "sequential" },
        { id: "seq2", from: "b", to: "c", kind: "sequential" },
        { id: "seq3", from: "c", to: "d", kind: "sequential" },
        { id: "seq4", from: "d", to: "term", kind: "sequential" },
        { id: "skip1", from: "a", to: "d", kind: "skip" },
        { id: "skip2", from: "b", to: "d", kind: "skip" },
      ];
      const diagnostics = analyzeWorkflowFlow(nodes, edges);
      expect(diagnostics.loops).toEqual([]);
    });

    it("returns empty diagnostics for an empty graph", () => {
      expect(analyzeWorkflowFlow([], [])).toEqual({ unreachable: [], deadEnds: [], loops: [] });
    });
  });
});
