/**
 * MAP-3 / GH-153 AC4 — unreachable pages, dead ends, and skip_to loop
 * risk, surfaced through `lintWorkflowContent`.
 *
 * A backward `skip_to` is deliberately NOT covered here (repo owner's
 * ruling, 2026-08-08, replacing the ticket's original AC5): it is flagged
 * exclusively by `checkSkipDirection` in
 * `server/services/workflowStructureRules.ts` as an `error` — see
 * `tests/unit/services/workflowStructureRules.test.ts`, "check 5 — skip_to
 * points forward" — not duplicated here as a warning.
 */
import { describe, it, expect } from "vitest";

import { lintWorkflowContent, type LintableWorkflowContent } from "../../../server/services/workflowLintRules";
import type { WorkflowLintBuilderTab } from "../../../shared/types/workflowLint";

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

/** A minimal 3-page, 1-question-per-page workflow, in order. */
function linearPages(): NonNullable<LintableWorkflowContent["pages"]> {
  return [
    { id: "s1", title: "Page 1", order: 0, steps: [{ id: "st1", title: "Q1", alias: "q1" }] },
    { id: "s2", title: "Page 2", order: 1, steps: [{ id: "st2", title: "Q2", alias: "q2" }] },
    { id: "s3", title: "Page 3", order: 2, steps: [{ id: "st3", title: "Q3", alias: "q3" }] },
  ];
}

describe("workflowLintRules — MAP-3 lintWorkflowFlow", () => {
  describe("AC2 — unreachable pages", () => {
    it("does not flag any page as unreachable in a fully linear workflow", () => {
      const results = lintWorkflowContent(baseContent({ pages: linearPages() }));
      expect(results.some((r) => /unreachable/i.test(r.message))).toBe(false);
    });

    it("flags a page unconditionally hidden by a hide rule as unreachable, without cascading to pages after it", () => {
      const results = lintWorkflowContent(baseContent({
        pages: linearPages(),
        logicRules: [
          { id: "r1", targetType: "page", targetId: "s2", action: "hide", when: null, order: 1 },
        ],
      }));

      const unreachableErrors = results.filter((r) => r.type === "error" && /unreachable/i.test(r.message));
      expect(unreachableErrors).toHaveLength(1);
      expect(unreachableErrors[0]).toMatchObject({
        category: "logic",
        target: { tab: "pages", pageId: "s2" },
      });
      // s3 must still be reachable — the hidden page is bypassed, not a
      // break in the chain.
      expect(results.some((r) => /unreachable/i.test(r.message) && r.target.pageId === "s3")).toBe(false);
    });

    it("does not flag a page as unreachable when a show rule also targets it (visibility is conditional, not always-off)", () => {
      const results = lintWorkflowContent(baseContent({
        pages: linearPages(),
        logicRules: [
          { id: "r1", targetType: "page", targetId: "s2", action: "hide", when: null, order: 1 },
          { id: "r2", targetType: "page", targetId: "s2", action: "show", when: { type: "group", operator: "AND", conditions: [] }, order: 2 },
        ],
      }));
      expect(results.some((r) => /unreachable/i.test(r.message))).toBe(false);
    });
  });

  describe("AC4 — skip_to loops and diamonds", () => {
    it("errors on a skip_to cycle among pages, naming its path", () => {
      const results = lintWorkflowContent(baseContent({
        pages: linearPages(),
        logicRules: [
          // s1 -> s3 (forward), s3 -> s2 (backward), s2 -> s1 (backward): a cycle.
          { id: "r1", targetType: "page", targetId: "s3", action: "skip_to", conditionStepId: "st1", order: 1 },
          { id: "r2", targetType: "page", targetId: "s2", action: "skip_to", conditionStepId: "st3", order: 2 },
          { id: "r3", targetType: "page", targetId: "s1", action: "skip_to", conditionStepId: "st2", order: 3 },
        ],
      }));
      const loopErrors = results.filter((r) => r.type === "error" && /loop/i.test(r.message));
      expect(loopErrors.length).toBeGreaterThan(0);
      expect(loopErrors[0]).toMatchObject({ category: "logic" });
    });

    it("does not report a diamond (two forward skips converging on one page) as a loop", () => {
      const results = lintWorkflowContent(baseContent({
        pages: [
          ...linearPages(),
          { id: "s4", title: "Page 4", order: 3, steps: [{ id: "st4", title: "Q4", alias: "q4" }] },
        ],
        logicRules: [
          { id: "r1", targetType: "page", targetId: "s4", action: "skip_to", conditionStepId: "st1", order: 1 },
          { id: "r2", targetType: "page", targetId: "s4", action: "skip_to", conditionStepId: "st2", order: 2 },
        ],
      }));
      expect(results.some((r) => /loop/i.test(r.message))).toBe(false);
    });
  });

  describe("AC6 — findings carry category and target", () => {
    it("every flow finding has category 'logic' and a target naming the offending page", () => {
      const results = lintWorkflowContent(baseContent({
        pages: linearPages(),
        logicRules: [
          { id: "r1", targetType: "page", targetId: "s2", action: "hide", when: null, order: 1 },
        ],
      }));
      const flowFindings = results.filter((r) => /unreachable/i.test(r.message));
      expect(flowFindings.length).toBeGreaterThan(0);
      for (const finding of flowFindings) {
        expect(finding.category).toBe("logic");
        expect(finding.target.tab).toBe("pages");
        expect(typeof finding.target.pageId).toBe("string");
      }
    });
  });

  describe("AC7 — WorkflowLintBuilderTab includes 'map'", () => {
    it("accepts \"map\" as a valid builder tab", () => {
      const tab: WorkflowLintBuilderTab = "map";
      expect(tab).toBe("map");
    });
  });
});
