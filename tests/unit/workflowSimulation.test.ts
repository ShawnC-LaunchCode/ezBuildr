import { describe, it, expect } from "vitest";

import {
  simulateWorkflowPath,
  type SimulationRuleInput,
  type SimulateWorkflowPathInput,
} from "@shared/workflowSimulation";
import {
  buildWorkflowMap,
  type WorkflowMapRuleInput,
  type WorkflowMapPageInput,
  type WorkflowMapStepInput,
} from "@shared/workflowMap";
import { calculateNextPage, evaluateWorkflowVisibility, resolveNextPage } from "@shared/workflowLogic";
import type { ConditionExpression } from "@shared/types/conditions";
import {
  resolveSectionMatrixAlias,
  sectionPageVisibilityCases,
  sectionPageVisibilityFixture,
} from "../fixtures/sectionVisibilityMatrix";

/**
 * `SimulationRuleInput` no longer carries `conditionStepId` (MAP-7 review —
 * the simulator reads the winning skip rule's id off
 * `WorkflowEvaluationResult.skipToRuleId` instead of searching for it, so it
 * never needed the field). Tests that also feed the same rule array into
 * `buildWorkflowMap` for an edge-id parity check still need it, since
 * `WorkflowMapRuleInput` requires it — this local type is that superset,
 * assignable to both.
 */
type MapRuleFixture = SimulationRuleInput & Pick<WorkflowMapRuleInput, "conditionStepId">;

/**
 * A minimal, real `ConditionExpression` — "is `variable` true?" — so tests
 * can drive genuinely data-dependent rules rather than the always-fires
 * `when: null` case.
 */
function isTrue(variable: string): ConditionExpression {
  return {
    type: "group",
    id: `grp-${variable}`,
    operator: "AND",
    conditions: [
      { type: "condition", id: `cond-${variable}`, variable, operator: "is_true", value: true, valueType: "constant" },
    ],
  };
}

const noResolveAlias = (): undefined => undefined;

/**
 * A linear three-page workflow with no rules — the default sequential
 * path. Mirrors `tests/fixtures/workflowMap.ts#linearThreePages`.
 */
function linearThreePages(): SimulateWorkflowPathInput {
  const pages: WorkflowMapPageInput[] = [
    { id: "page-a", title: "Page A", order: 0 },
    { id: "page-b", title: "Page B", order: 1 },
    { id: "page-c", title: "Page C", order: 2 },
  ];
  return { pages, steps: [], rules: [], data: {}, resolveAlias: noResolveAlias };
}

/**
 * A forward `skip_to` rule, conditioned on a real step value: when
 * `step-a-trigger` is true, page A routes straight to page C,
 * skipping page B. Mirrors
 * `tests/fixtures/workflowMap.ts#workflowWithForwardSkip`, with a genuine
 * `when` condition added (the map-model fixture has no `when` since
 * `buildWorkflowMap` never evaluates one).
 */
function forwardSkipWorkflow(): { pages: WorkflowMapPageInput[]; steps: WorkflowMapStepInput[]; rules: MapRuleFixture[] } {
  const pages: WorkflowMapPageInput[] = [
    { id: "page-a", title: "Page A", order: 0 },
    { id: "page-b", title: "Page B", order: 1 },
    { id: "page-c", title: "Page C", order: 2 },
  ];
  const steps: WorkflowMapStepInput[] = [
    { id: "step-a-trigger", pageId: "page-a", type: "short_text", title: "Skip ahead?" },
  ];
  const rules: MapRuleFixture[] = [
    {
      id: "rule-skip-forward",
      conditionStepId: "step-a-trigger",
      when: isTrue("step-a-trigger"),
      action: "skip_to",
      targetType: "page",
      targetPageId: "page-c",
      targetStepId: null,
      order: 1,
    },
  ];
  return { pages, steps, rules };
}

/**
 * A backward `skip_to` rule targeting the very first page — a no-op at
 * runtime per `isForwardSkipTarget` (RUN2-2) once the walk has passed it.
 * Mirrors `tests/fixtures/workflowMap.ts#workflowWithBackwardSkip`.
 */
function backwardSkipWorkflow(): { pages: WorkflowMapPageInput[]; steps: WorkflowMapStepInput[]; rules: MapRuleFixture[] } {
  const pages: WorkflowMapPageInput[] = [
    { id: "page-a", title: "Page A", order: 0 },
    { id: "page-b", title: "Page B", order: 1 },
    { id: "page-c", title: "Page C", order: 2 },
  ];
  const steps: WorkflowMapStepInput[] = [
    { id: "step-c-trigger", pageId: "page-c", type: "short_text", title: "Go back?" },
  ];
  const rules: MapRuleFixture[] = [
    {
      id: "rule-skip-backward",
      conditionStepId: "step-c-trigger",
      when: isTrue("step-c-trigger"),
      action: "skip_to",
      targetType: "page",
      targetPageId: "page-a",
      targetStepId: null,
      order: 1,
    },
  ];
  return { pages, steps, rules };
}

/**
 * Two `skip_to` rules target the *same* page (`page-d`) from two
 * *different* origin pages. `rule-from-A` (order 5) is placed **first**
 * in the array but its condition never fires. `rule-from-B` (order 0, the
 * lower — and therefore winning — order) is placed second and its condition
 * is met. `evaluateRules` (`shared/workflowLogic.ts`) sorts by `order` and
 * fires-then-first-wins, so it always picks `rule-from-B` regardless of
 * array position. A simulator that instead searches the raw `rules` array by
 * `action`/`targetType`/`targetPageId` (ignoring both `order` and whether
 * the condition actually fired) picks whichever matching rule is first in
 * the array — `rule-from-A` here — and mislabels the traversed edge.
 */
function ambiguousSkipTargetWorkflow(): { pages: WorkflowMapPageInput[]; steps: WorkflowMapStepInput[]; rules: MapRuleFixture[] } {
  const pages: WorkflowMapPageInput[] = [
    { id: "page-a", title: "Page A", order: 0 },
    { id: "page-b", title: "Page B", order: 1 },
    { id: "page-d", title: "Page D", order: 2 },
  ];
  const steps: WorkflowMapStepInput[] = [
    { id: "step-a-trigger", pageId: "page-a", type: "short_text", title: "From A?" },
    { id: "step-b-trigger", pageId: "page-b", type: "short_text", title: "From B?" },
  ];
  const rules: MapRuleFixture[] = [
    {
      id: "rule-from-A",
      conditionStepId: "step-a-trigger",
      when: isTrue("step-a-trigger"),
      action: "skip_to",
      targetType: "page",
      targetPageId: "page-d",
      targetStepId: null,
      order: 5,
    },
    {
      id: "rule-from-B",
      conditionStepId: "step-b-trigger",
      when: isTrue("step-b-trigger"),
      action: "skip_to",
      targetType: "page",
      targetPageId: "page-d",
      targetStepId: null,
      order: 0,
    },
  ];
  return { pages, steps, rules };
}

/**
 * Page B is hidden unless `has_pet` is true. Mirrors
 * `tests/fixtures/workflowMap.ts#workflowWithConditionalPage`'s
 * `visibleIf`, applied to a page that sits *between* two always-visible
 * ones so the omitted middle page is unambiguous.
 */
function hiddenMiddlePageWorkflow(): SimulateWorkflowPathInput {
  const pages: WorkflowMapPageInput[] = [
    { id: "page-a", title: "Page A", order: 0 },
    { id: "page-b", title: "Page B", order: 1, visibleIf: isTrue("has_pet") },
    { id: "page-c", title: "Page C", order: 2 },
  ];
  return { pages, steps: [], rules: [], data: {}, resolveAlias: noResolveAlias };
}

/**
 * Malformed input: `page-a` appears twice, at orders 0 and 2, under the
 * same id. Real DB rows can never collide like this (ids are primary keys),
 * but nothing stops a corrupt/adversarial input from doing so — and it is
 * enough to defeat `isForwardSkipTarget`'s no-genuine-loop guarantee at the
 * `calculateNextPage` level: `findIndex` always resolves `'page-a'` to
 * its *first* occurrence, so the walk oscillates a -> b -> a -> b forever.
 * AC8 exists for exactly this: hanging the author's browser is worse than
 * reporting truncation.
 */
function oscillatingMalformedWorkflow(): SimulateWorkflowPathInput {
  const pages: WorkflowMapPageInput[] = [
    { id: "page-a", title: "Page A", order: 0 },
    { id: "page-b", title: "Page B", order: 1 },
    { id: "page-a", title: "Page A (duplicate)", order: 2 },
  ];
  return { pages, steps: [], rules: [], data: {}, resolveAlias: noResolveAlias };
}

/**
 * Drives `evaluateWorkflowVisibility`, `calculateNextPage` and
 * `resolveNextPage` directly, in the same order and with the same
 * arguments `LogicService.evaluateNavigation()`
 * (`server/services/LogicService.ts`) does — used only to build an
 * independent "what would the server decide" walk for the simulator's
 * local composition check. This is not the SECT-7 server proof: the shared
 * matrix also runs through the actual `LogicService` and
 * `RunDefinitionProvider` in `LogicService.pinnedDefinition.test.ts`.
 */
function serverStyleWalk(input: SimulateWorkflowPathInput): string[] {
  const { sections = [], pages, steps, rules, data, resolveAlias } = input;
  const orderedPages = pages.map((s) => ({ id: s.id, order: s.order }));
  const visited: string[] = [];
  let current: string | null = null;

  for (let i = 0; i < pages.length + 1; i++) {
    const visibility = evaluateWorkflowVisibility({ sections, pages, steps, rules, data, resolveAlias });
    const nextPageId = calculateNextPage(current, orderedPages, visibility.visiblePages);
    const resolved = resolveNextPage(
      current,
      nextPageId,
      visibility.ruleEvaluation.skipToPageId,
      orderedPages,
      visibility.visiblePages
    );
    if (resolved === null) { break; }
    visited.push(resolved);
    current = resolved;
  }

  return visited;
}

describe("simulateWorkflowPath", () => {
  describe("SECT-7 Section parity", () => {
    it.each(sectionPageVisibilityCases)(
      "matches the shared matrix for section=$sectionVisible/page=$pageVisible",
      ({ data, expectedVisiblePageIds }) => {
        const input: SimulateWorkflowPathInput = {
          ...sectionPageVisibilityFixture,
          data,
          resolveAlias: resolveSectionMatrixAlias,
        };
        expect(simulateWorkflowPath(input).visited).toEqual(expectedVisiblePageIds);
        expect(simulateWorkflowPath(input).visited).toEqual(serverStyleWalk(input));
      },
    );
  });

  describe("AC2 — linear workflow, no rules", () => {
    it("visits every page in order and leaves nothing unvisited", () => {
      const result = simulateWorkflowPath(linearThreePages());
      expect(result.visited).toEqual(["page-a", "page-b", "page-c"]);
      expect(result.notVisited).toEqual([]);
      expect(result.truncated).toBe(false);
    });
  });

  describe("AC3 — forward skip_to, condition met", () => {
    it("omits the skipped page from visited and lists it in notVisited", () => {
      const { pages, steps, rules } = forwardSkipWorkflow();
      const result = simulateWorkflowPath({
        pages,
        steps,
        rules,
        data: { "step-a-trigger": true },
        resolveAlias: noResolveAlias,
      });
      expect(result.visited).toEqual(["page-c"]);
      expect(result.notVisited).toEqual(["page-a", "page-b"]);
      expect(result.truncated).toBe(false);
    });

    it("takes the normal sequential path when the condition is not met", () => {
      const { pages, steps, rules } = forwardSkipWorkflow();
      const result = simulateWorkflowPath({
        pages,
        steps,
        rules,
        data: { "step-a-trigger": false },
        resolveAlias: noResolveAlias,
      });
      expect(result.visited).toEqual(["page-a", "page-b", "page-c"]);
      expect(result.notVisited).toEqual([]);
    });
  });

  describe("AC4 — backward skip_to is a no-op", () => {
    it("yields the same path as no rule at all, even though the condition is met", () => {
      const { pages, steps, rules } = backwardSkipWorkflow();
      const withRule = simulateWorkflowPath({
        pages,
        steps,
        rules,
        data: { "step-c-trigger": true },
        resolveAlias: noResolveAlias,
      });
      const withoutRule = simulateWorkflowPath({
        pages,
        steps,
        rules: [],
        data: { "step-c-trigger": true },
        resolveAlias: noResolveAlias,
      });
      expect(withRule.visited).toEqual(["page-a", "page-b", "page-c"]);
      expect(withRule.visited).toEqual(withoutRule.visited);
    });
  });

  describe("AC5 — page hidden by visibleIf", () => {
    it("is absent from visited and present in notVisited", () => {
      const result = simulateWorkflowPath(hiddenMiddlePageWorkflow());
      expect(result.visited).toEqual(["page-a", "page-c"]);
      expect(result.notVisited).toEqual(["page-b"]);
    });
  });

  describe("AC6 — traversedEdges matches buildWorkflowMap's edge ids", () => {
    it("matches for the linear no-rules path", () => {
      const input = linearThreePages();
      const result = simulateWorkflowPath(input);
      // `input.rules` is empty but typed as `SimulationRuleInput[]`, which no
      // longer carries `conditionStepId` — pass a fresh empty literal rather
      // than that field, since `buildWorkflowMap` requires
      // `WorkflowMapRuleInput[]`.
      const { edges } = buildWorkflowMap({ pages: input.pages, steps: input.steps, rules: [] });
      const mapEdgeIds = new Set(edges.map((e) => e.id));

      expect(result.traversedEdges).toEqual([
        "sequential:page-a->page-b",
        "sequential:page-b->page-c",
        "sequential:page-c->__complete__",
      ]);
      for (const edgeId of result.traversedEdges) {
        expect(mapEdgeIds.has(edgeId)).toBe(true);
      }
    });

    it("matches for the forward-skip path, using the skip edge's own id", () => {
      const { pages, steps, rules } = forwardSkipWorkflow();
      const result = simulateWorkflowPath({
        pages,
        steps,
        rules,
        data: { "step-a-trigger": true },
        resolveAlias: noResolveAlias,
      });
      const { edges } = buildWorkflowMap({ pages, steps, rules });
      const mapEdgeIds = new Set(edges.map((e) => e.id));

      expect(result.traversedEdges).toEqual([
        "skip:rule-skip-forward",
        "sequential:page-c->__complete__",
      ]);
      for (const edgeId of result.traversedEdges) {
        expect(mapEdgeIds.has(edgeId)).toBe(true);
      }
    });
  });

  describe("review defect — ambiguous skip target names the rule that actually fired", () => {
    it("labels the traversed edge with the winning rule's id, not the first array match", () => {
      const { pages, steps, rules } = ambiguousSkipTargetWorkflow();
      const result = simulateWorkflowPath({
        pages,
        steps,
        rules,
        // Only rule-from-B's condition is met. rule-from-A's target/action
        // match too, but it never fires — a `rules.find()` keyed on
        // action/targetType/targetPageId alone (ignoring `order` and
        // firing) would still return it, because it appears first in the
        // array.
        data: { "step-a-trigger": false, "step-b-trigger": true },
        resolveAlias: noResolveAlias,
      });

      expect(result.visited).toEqual(["page-d"]);
      expect(result.traversedEdges).toEqual([
        "skip:rule-from-B",
        "sequential:page-d->__complete__",
      ]);
      expect(result.traversedEdges).not.toContain("skip:rule-from-A");
    });
  });

  describe("AC7 — parity with the server's navigation decision", () => {
    it("agrees with a server-style walk over the linear fixture", () => {
      const input = linearThreePages();
      expect(simulateWorkflowPath(input).visited).toEqual(serverStyleWalk(input));
    });

    it("agrees with a server-style walk over the forward-skip fixture", () => {
      const { pages, steps, rules } = forwardSkipWorkflow();
      const input: SimulateWorkflowPathInput = {
        pages,
        steps,
        rules,
        data: { "step-a-trigger": true },
        resolveAlias: noResolveAlias,
      };
      expect(simulateWorkflowPath(input).visited).toEqual(serverStyleWalk(input));
    });

    it("agrees with a server-style walk over the hidden-page fixture", () => {
      const input = hiddenMiddlePageWorkflow();
      expect(simulateWorkflowPath(input).visited).toEqual(serverStyleWalk(input));
    });
  });

  describe("AC8 — iteration cap", () => {
    it("sets truncated instead of looping forever on malformed duplicate-id input", () => {
      const input = oscillatingMalformedWorkflow();
      const result = simulateWorkflowPath(input);
      expect(result.truncated).toBe(true);
      // Proves the walk actually ran to the cap (pages.length + 1 = 4)
      // rather than stopping early for some unrelated reason.
      expect(result.visited).toHaveLength(input.pages.length + 1);
    });

    it("does not truncate a well-formed workflow that completes normally", () => {
      const result = simulateWorkflowPath(linearThreePages());
      expect(result.truncated).toBe(false);
    });
  });
});
