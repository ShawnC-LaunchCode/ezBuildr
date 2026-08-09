/**
 * Named `shared/workflowMap.ts` input fixtures, shared by MAP-2's own tests
 * and reused (per the MAP tickets in `tickets/WORKFLOW_MAP_TICKETS.md`) by
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
 * Three sections, deliberately declared in an array order that does NOT
 * match their `order` field, and no rules — the default sequential path.
 * Proves `buildWorkflowMap` sorts by `order` rather than trusting input
 * array order (MAP-2 AC2).
 */
export function linearThreeSections(): BuildWorkflowMapInput {
  return {
    sections: [
      { id: "section-b", title: "Section B", order: 1 },
      { id: "section-a", title: "Section A", order: 0 },
      { id: "section-c", title: "Section C", order: 2 },
    ],
    steps: [],
    rules: [],
  };
}

/**
 * A `skip_to` rule whose condition lives in the first section and whose
 * target is a later section — a genuine forward route (MAP-2 AC4;
 * `isForwardSkipTarget` in `shared/workflowLogic.ts` would treat this as
 * live at runtime).
 */
export function workflowWithForwardSkip(): BuildWorkflowMapInput {
  return {
    sections: [
      { id: "section-a", title: "Section A", order: 0 },
      { id: "section-b", title: "Section B", order: 1 },
      { id: "section-c", title: "Section C", order: 2 },
    ],
    steps: [
      { id: "step-a-trigger", sectionId: "section-a", type: "short_text", title: "Skip ahead?" },
    ],
    rules: [
      {
        id: "rule-skip-forward",
        conditionStepId: "step-a-trigger",
        action: "skip_to",
        targetType: "section",
        targetSectionId: "section-c",
        targetStepId: null,
        order: 1,
      },
    ],
  };
}

/**
 * A `skip_to` rule whose target section comes *before* the condition's own
 * section — a no-op at runtime per `isForwardSkipTarget` (RUN2-2), but the
 * graph model still draws the edge: whether it's a no-op is MAP-3's flow
 * analysis to report, not something this graph pre-filters.
 */
export function workflowWithBackwardSkip(): BuildWorkflowMapInput {
  return {
    sections: [
      { id: "section-a", title: "Section A", order: 0 },
      { id: "section-b", title: "Section B", order: 1 },
      { id: "section-c", title: "Section C", order: 2 },
    ],
    steps: [
      { id: "step-c-trigger", sectionId: "section-c", type: "short_text", title: "Go back?" },
    ],
    rules: [
      {
        id: "rule-skip-backward",
        conditionStepId: "step-c-trigger",
        action: "skip_to",
        targetType: "section",
        targetSectionId: "section-a",
        targetStepId: null,
        order: 1,
      },
    ],
  };
}

/**
 * A middle section controlled entirely by an unconditional `hide` rule with
 * no matching `show` — nothing else routes to it directly, so a flow
 * analysis (MAP-3) that treats a permanently-hidden, only-sequentially-reached
 * section as unreachable has real data to flag here. Doubles as the
 * "targeted by a hide rule" half of MAP-2 AC5 (`conditional: true` with no
 * `visibleIf` of its own).
 */
export function workflowWithUnreachableSection(): BuildWorkflowMapInput {
  return {
    sections: [
      { id: "section-a", title: "Section A", order: 0 },
      { id: "section-b", title: "Section B", order: 1 },
      { id: "section-c", title: "Section C", order: 2 },
    ],
    steps: [
      { id: "step-a-cond", sectionId: "section-a", type: "short_text", title: "Condition source" },
    ],
    rules: [
      {
        id: "rule-hide-b",
        conditionStepId: "step-a-cond",
        action: "hide",
        targetType: "section",
        targetSectionId: "section-b",
        targetStepId: null,
        order: 1,
      },
    ],
  };
}

/**
 * A section carrying a `final_documents` step — D-2 promotes it to an
 * additional node downstream of the section, not a replacement for it
 * (MAP-2 AC3).
 */
export function workflowWithFinalDocuments(): BuildWorkflowMapInput {
  return {
    sections: [
      { id: "section-a", title: "Section A", order: 0 },
      { id: "section-b", title: "Section B", order: 1 },
    ],
    steps: [
      { id: "step-doc", sectionId: "section-a", type: "final_documents", title: "Generated Documents" },
    ],
    rules: [],
  };
}

/**
 * A `skip_to` rule whose target section id matches nothing in `sections` —
 * a real-looking-but-absent target, not an empty rules array. Must yield no
 * edge at all (MAP-2 AC4).
 */
export function workflowWithDanglingSkipTarget(): BuildWorkflowMapInput {
  return {
    sections: [
      { id: "section-a", title: "Section A", order: 0 },
      { id: "section-b", title: "Section B", order: 1 },
    ],
    steps: [
      { id: "step-a-trigger", sectionId: "section-a", type: "short_text", title: "Skip ahead?" },
    ],
    rules: [
      {
        id: "rule-skip-dangling",
        conditionStepId: "step-a-trigger",
        action: "skip_to",
        targetType: "section",
        targetSectionId: "section-ghost",
        targetStepId: null,
        order: 1,
      },
    ],
  };
}

/**
 * A section with its own non-null `visibleIf`, plus a step inside it with
 * its own `visibleIf` — the `visibleIf` half of MAP-2 AC5, and coverage for
 * `conditionalStepIds` (the expand-on-demand payload, D-2).
 */
export function workflowWithConditionalSection(): BuildWorkflowMapInput {
  return {
    sections: [
      { id: "section-a", title: "Section A", order: 0, visibleIf: conditionExpr("has_pet") },
      { id: "section-b", title: "Section B", order: 1 },
    ],
    steps: [
      { id: "step-a-cond", sectionId: "section-a", type: "short_text", title: "Pet name", visibleIf: conditionExpr("has_pet") },
      { id: "step-a-plain", sectionId: "section-a", type: "short_text", title: "Unconditional step" },
    ],
    rules: [],
  };
}
