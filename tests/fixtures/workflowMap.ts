/**
 * Named `shared/workflowMap.ts` input fixtures, shared by MAP-2's own tests
 * and reused (per the MAP tickets in `tickets/backlog/WORKFLOW_MAP.md`) by
 * MAP-4 (map rendering), MAP-7 (path simulator) and MAP-8 (simulation
 * panel), so the map's test data doesn't drift into per-ticket copies.
 *
 * Each builder returns a fresh object (never a shared mutable literal) so a
 * consumer can safely mutate its own copy.
 */

import type { BuildWorkflowMapInput } from "@shared/workflowMap";

/** A minimal, realistic-shaped `ConditionExpression`-like value. Content is irrelevant here — nothing in `buildWorkflowMap` evaluates it. */
function conditionExpr(variable: string): unknown {
  return {
    type: "group",
    operator: "AND",
    conditions: [{ type: "condition", variable, operator: "is_true", value: true, valueType: "constant" }],
  };
}

/**
 * Three pages, deliberately declared in an array order that does NOT
 * match their `order` field, and no rules — the default sequential path.
 * Proves `buildWorkflowMap` sorts by `order` rather than trusting input
 * array order (MAP-2 AC2).
 */
export function linearThreePages(): BuildWorkflowMapInput {
  return {
    pages: [
      { id: "page-b", title: "Page B", order: 1 },
      { id: "page-a", title: "Page A", order: 0 },
      { id: "page-c", title: "Page C", order: 2 },
    ],
    steps: [],
    rules: [],
  };
}

/**
 * A `skip_to` rule whose condition lives in the first page and whose
 * target is a later page — a genuine forward route (MAP-2 AC4;
 * `isForwardSkipTarget` in `shared/workflowLogic.ts` would treat this as
 * live at runtime).
 */
export function workflowWithForwardSkip(): BuildWorkflowMapInput {
  return {
    pages: [
      { id: "page-a", title: "Page A", order: 0 },
      { id: "page-b", title: "Page B", order: 1 },
      { id: "page-c", title: "Page C", order: 2 },
    ],
    steps: [
      { id: "step-a-trigger", pageId: "page-a", type: "short_text", title: "Skip ahead?" },
    ],
    rules: [
      {
        id: "rule-skip-forward",
        conditionStepId: "step-a-trigger",
        action: "skip_to",
        targetType: "page",
        targetPageId: "page-c",
        targetStepId: null,
        order: 1,
      },
    ],
  };
}

/**
 * A `skip_to` rule whose target page comes *before* the condition's own
 * page — a no-op at runtime per `isForwardSkipTarget` (RUN2-2), but the
 * graph model still draws the edge: whether it's a no-op is MAP-3's flow
 * analysis to report, not something this graph pre-filters.
 */
export function workflowWithBackwardSkip(): BuildWorkflowMapInput {
  return {
    pages: [
      { id: "page-a", title: "Page A", order: 0 },
      { id: "page-b", title: "Page B", order: 1 },
      { id: "page-c", title: "Page C", order: 2 },
    ],
    steps: [
      { id: "step-c-trigger", pageId: "page-c", type: "short_text", title: "Go back?" },
    ],
    rules: [
      {
        id: "rule-skip-backward",
        conditionStepId: "step-c-trigger",
        action: "skip_to",
        targetType: "page",
        targetPageId: "page-a",
        targetStepId: null,
        order: 1,
      },
    ],
  };
}

/**
 * A middle page controlled entirely by an unconditional `hide` rule with
 * no matching `show` — nothing else routes to it directly, so a flow
 * analysis (MAP-3) that treats a permanently-hidden, only-sequentially-reached
 * page as unreachable has real data to flag here. Doubles as the
 * "targeted by a hide rule" half of MAP-2 AC5 (`conditional: true` with no
 * `visibleIf` of its own).
 */
export function workflowWithUnreachablePage(): BuildWorkflowMapInput {
  return {
    pages: [
      { id: "page-a", title: "Page A", order: 0 },
      { id: "page-b", title: "Page B", order: 1 },
      { id: "page-c", title: "Page C", order: 2 },
    ],
    steps: [
      { id: "step-a-cond", pageId: "page-a", type: "short_text", title: "Condition source" },
    ],
    rules: [
      {
        id: "rule-hide-b",
        conditionStepId: "step-a-cond",
        action: "hide",
        targetType: "page",
        targetPageId: "page-b",
        targetStepId: null,
        order: 1,
      },
    ],
  };
}

/**
 * A page carrying a `final_documents` step — D-2 promotes it to an
 * additional node downstream of the page, not a replacement for it
 * (MAP-2 AC3).
 */
export function workflowWithFinalDocuments(): BuildWorkflowMapInput {
  return {
    pages: [
      { id: "page-a", title: "Page A", order: 0 },
      { id: "page-b", title: "Page B", order: 1 },
    ],
    steps: [
      { id: "step-doc", pageId: "page-a", type: "final_documents", title: "Generated Documents" },
    ],
    rules: [],
  };
}

/**
 * A `skip_to` rule whose target page id matches nothing in `pages` —
 * a real-looking-but-absent target, not an empty rules array. Must yield no
 * edge at all (MAP-2 AC4).
 */
export function workflowWithDanglingSkipTarget(): BuildWorkflowMapInput {
  return {
    pages: [
      { id: "page-a", title: "Page A", order: 0 },
      { id: "page-b", title: "Page B", order: 1 },
    ],
    steps: [
      { id: "step-a-trigger", pageId: "page-a", type: "short_text", title: "Skip ahead?" },
    ],
    rules: [
      {
        id: "rule-skip-dangling",
        conditionStepId: "step-a-trigger",
        action: "skip_to",
        targetType: "page",
        targetPageId: "page-ghost",
        targetStepId: null,
        order: 1,
      },
    ],
  };
}

/**
 * A page with its own non-null `visibleIf`, plus a step inside it with
 * its own `visibleIf` — the `visibleIf` half of MAP-2 AC5, and coverage for
 * `conditionalStepIds` (the expand-on-demand payload, D-2).
 */
export function workflowWithConditionalPage(): BuildWorkflowMapInput {
  return {
    pages: [
      { id: "page-a", title: "Page A", order: 0, visibleIf: conditionExpr("has_pet") },
      { id: "page-b", title: "Page B", order: 1 },
    ],
    steps: [
      { id: "step-a-cond", pageId: "page-a", type: "short_text", title: "Pet name", visibleIf: conditionExpr("has_pet") },
      { id: "step-a-plain", pageId: "page-a", type: "short_text", title: "Unconditional step" },
    ],
    rules: [],
  };
}
