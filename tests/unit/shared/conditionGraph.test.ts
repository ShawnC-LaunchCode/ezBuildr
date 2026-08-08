import { describe, it, expect } from "vitest";

import {
  buildConditionDependencyGraph,
  detectCycles,
  detectDanglingReferences,
  extractConditionReferences,
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
});
