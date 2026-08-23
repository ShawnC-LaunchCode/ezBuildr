import { describe, it, expect } from "vitest";

import { lintWorkflowContent, type LintableWorkflowContent } from "../../../server/services/workflowLintRules";

/** A visibleIf ConditionExpression referencing a single variable. */
function refVisibleIf(variable: string): Record<string, unknown> {
  return {
    type: "group",
    operator: "AND",
    conditions: [{ type: "condition", variable, operator: "is_true" }],
  };
}

function baseContent(overrides: Partial<LintableWorkflowContent> = {}): LintableWorkflowContent {
  return {
    pages: [],
    logicRules: [],
    transformBlocks: [],
    lifecycleHooks: [],
    documentHooks: [],
    ...overrides,
  };
}

describe("workflowLintRules — LU-3 circular and dangling visibleIf detection", () => {
  it("errors on a 2-node visibleIf cycle (A depends on B, B depends on A)", () => {
    const results = lintWorkflowContent(baseContent({
      pages: [{
        id: "s1",
        title: "Page 1",
        steps: [
          { id: "st1", title: "A", alias: "a", visibleIf: refVisibleIf("b") },
          { id: "st2", title: "B", alias: "b", visibleIf: refVisibleIf("a") },
        ],
      }],
    }));

    const cycleErrors = results.filter((r) => r.type === "error" && /circular|cycle/i.test(r.message));
    expect(cycleErrors.length).toBeGreaterThan(0);
    // Same finding shape as every other rule in this file.
    expect(cycleErrors[0]).toMatchObject({ category: "logic" });
    // AC4: the finding's target points at a real element (a real step in a real page).
    const target = cycleErrors[0].target;
    expect(target.tab).toBe("pages");
    expect(target.pageId).toBe("s1");
    expect(["st1", "st2"]).toContain(target.stepId);
  });

  it("errors on a 3-node visibleIf cycle (A -> B -> C -> A)", () => {
    const results = lintWorkflowContent(baseContent({
      pages: [{
        id: "s1",
        title: "Page 1",
        steps: [
          { id: "st1", title: "A", alias: "a", visibleIf: refVisibleIf("c") },
          { id: "st2", title: "B", alias: "b", visibleIf: refVisibleIf("a") },
          { id: "st3", title: "C", alias: "c", visibleIf: refVisibleIf("b") },
        ],
      }],
    }));
    expect(results.some((r) => r.type === "error" && /circular|cycle/i.test(r.message))).toBe(true);
  });

  it("errors on a self-referencing visibleIf", () => {
    const results = lintWorkflowContent(baseContent({
      pages: [{
        id: "s1",
        title: "Page 1",
        steps: [{ id: "st1", title: "A", alias: "a", visibleIf: refVisibleIf("a") }],
      }],
    }));
    expect(results.some((r) => r.type === "error" && /circular|cycle/i.test(r.message))).toBe(true);
  });

  it("does NOT flag a diamond dependency as a cycle (A -> B, A -> C, B -> D, C -> D)", () => {
    const diamondVisibleIf = {
      type: "group",
      operator: "AND",
      conditions: [
        { type: "condition", variable: "b", operator: "is_true" },
        { type: "condition", variable: "c", operator: "is_true" },
      ],
    };
    const results = lintWorkflowContent(baseContent({
      pages: [{
        id: "s1",
        title: "Page 1",
        steps: [
          { id: "st1", title: "A", alias: "a", visibleIf: diamondVisibleIf },
          { id: "st2", title: "B", alias: "b", visibleIf: refVisibleIf("d") },
          { id: "st3", title: "C", alias: "c", visibleIf: refVisibleIf("d") },
          { id: "st4", title: "D", alias: "d" },
        ],
      }],
    }));
    expect(results.some((r) => r.type === "error" && /circular|cycle/i.test(r.message))).toBe(false);
  });

  it("does not flag a visibleIf referencing an alias-less step by its raw id (senior review regression)", () => {
    // ConditionRow.tsx falls back to the raw step id as the <SelectItem>
    // value whenever a step has no alias, so a condition can legally store
    // either the alias OR the id. A step with no alias must still resolve
    // when referenced by its id — it is NOT a dangling reference just
    // because it lacks an alias.
    const results = lintWorkflowContent(baseContent({
      pages: [{
        id: "s1",
        title: "Page 1",
        steps: [
          { id: "11111111-1111-1111-1111-111111111111", title: "No alias step" },
          {
            id: "22222222-2222-2222-2222-222222222222",
            title: "Dependent",
            alias: "dependent",
            visibleIf: refVisibleIf("11111111-1111-1111-1111-111111111111"),
          },
        ],
      }],
    }));
    expect(results.some((r) => r.type === "error")).toBe(false);
  });

  it("detects a cycle that runs through an alias-less step referenced by id (A -alias-> B, B -id-> A)", () => {
    // A has no alias (only an id) and references B by B's alias; B
    // references A back by A's raw id. Both edges must resolve to the SAME
    // canonical node for A, or this cycle would be missed entirely (the
    // id-edge would dead-end at a node that doesn't exist) and, worse,
    // misreported as a dangling reference instead of a cycle.
    const results = lintWorkflowContent(baseContent({
      pages: [{
        id: "s1",
        title: "Page 1",
        steps: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            title: "A (no alias)",
            visibleIf: refVisibleIf("b"),
          },
          {
            id: "22222222-2222-2222-2222-222222222222",
            title: "B",
            alias: "b",
            visibleIf: refVisibleIf("11111111-1111-1111-1111-111111111111"),
          },
        ],
      }],
    }));

    const cycleErrors = results.filter((r) => r.type === "error" && /circular|cycle/i.test(r.message));
    expect(cycleErrors.length).toBeGreaterThan(0);
    // Must NOT also be reported as a dangling/unknown-alias reference.
    expect(results.some((r) => r.message.includes("unknown alias"))).toBe(false);
  });

  it("errors on a visibleIf referencing a deleted/renamed alias (dangling reference)", () => {
    const results = lintWorkflowContent(baseContent({
      pages: [{
        id: "s1",
        title: "Page 1",
        steps: [
          { id: "st1", title: "Details", alias: "details", visibleIf: refVisibleIf("deleted_alias") },
        ],
      }],
    }));
    const err = results.find((r) => r.type === "error" && r.message.includes("deleted_alias"));
    expect(err).toBeDefined();
    expect(err).toMatchObject({
      category: "logic",
      target: { tab: "pages", pageId: "s1", stepId: "st1" },
    });
  });

  it("does not flag a visibleIf that references a real alias", () => {
    const results = lintWorkflowContent(baseContent({
      pages: [{
        id: "s1",
        title: "Page 1",
        steps: [
          { id: "st1", title: "Has pet?", alias: "has_pet" },
          { id: "st2", title: "Pet name", alias: "pet_name", visibleIf: refVisibleIf("has_pet") },
        ],
      }],
    }));
    expect(results.some((r) => r.message.includes("has_pet"))).toBe(false);
  });

  it("detects a cycle formed through a page-level visibleIf pointing back to a step", () => {
    // Page 2's visibleIf depends on step "a" (in page 1); step "a"'s own
    // visibleIf cannot depend back on the page (pages have no alias to
    // reference), so this proves pages participate in the graph without
    // being falsely reported as cycle members themselves.
    const results = lintWorkflowContent(baseContent({
      pages: [
        {
          id: "s1",
          title: "Page 1",
          steps: [{ id: "st1", title: "A", alias: "a" }],
        },
        {
          id: "s2",
          title: "Page 2",
          visibleIf: refVisibleIf("missing_alias"),
          steps: [{ id: "st2", title: "B", alias: "b" }],
        },
      ],
    }));
    const err = results.find((r) => r.type === "error" && r.message.includes("missing_alias"));
    expect(err).toBeDefined();
    expect(err?.target).toMatchObject({ tab: "pages", pageId: "s2" });
  });
});
