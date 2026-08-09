/**
 * Deterministic workflow path simulation (GH-153 AC3, MAP-7).
 *
 * Walks a workflow from the start to completion under a hypothetical answer
 * set, so the map (MAP-8) can highlight the route an author's "what if"
 * answers would actually produce at runtime.
 *
 * **This module composes, it does not decide.** The only server-side
 * implementation of route resolution is `LogicService.evaluateNavigation()`
 * (`server/services/LogicService.ts`), which calls three shared functions in
 * this exact order:
 *
 *   1. `evaluateWorkflowVisibility` — which sections/steps are visible, and
 *      whether any `skip_to` rule's condition fired.
 *   2. `calculateNextSection` — the normal (no-skip) next visible section.
 *   3. `resolveNextSection` — the actual next section, letting a *forward*
 *      skip target win over the normal one (a backward target is a no-op,
 *      per `isForwardSkipTarget`/RUN2-2).
 *
 * `simulateWorkflowPath` below calls the same three functions from
 * `shared/workflowLogic.ts`, in the same order, in a loop — it never
 * inlines, reimplements, or "simplifies" any of them. Doing so would make
 * this the first client-reachable implementation of route resolution with no
 * test tying it to the server's, which is exactly the divergence GH-154's
 * predecessor spent eight tickets undoing (see MAP-7 in
 * `tickets/backlog/WORKFLOW_MAP.md`).
 *
 * Edge ids in `traversedEdges` reuse `shared/workflowMap.ts`'s convention
 * (`sequential:${from}->${to}`, `skip:${ruleId}`) rather than inventing a new
 * one, so the map can highlight `buildWorkflowMap`'s own edges directly.
 */

import {
  calculateNextSection,
  evaluateWorkflowVisibility,
  resolveNextSection,
  type EvaluableLogicRule,
} from './workflowLogic';
import {
  WORKFLOW_MAP_TERMINAL_NODE_ID,
  type WorkflowMapSectionInput,
  type WorkflowMapStepInput,
} from './workflowMap';

/**
 * A rule as the simulator needs it — exactly `EvaluableLogicRule`, which
 * already carries `id` (needed only to label a traversed `skip` edge, read
 * off `WorkflowEvaluationResult.skipToRuleId` rather than searched for here —
 * see the note in the loop below). Named separately from
 * `EvaluableLogicRule` so this module's own consumers (MAP-8) have a
 * domain-specific type to import.
 */
export type SimulationRuleInput = EvaluableLogicRule;

export interface SimulateWorkflowPathInput {
  sections: WorkflowMapSectionInput[];
  steps: WorkflowMapStepInput[];
  rules: SimulationRuleInput[];
  /** Hypothetical answers, keyed by step id (see `resolveAlias`). */
  data: Record<string, unknown>;
  /** Resolves a step alias referenced by a condition to its step id — build it the way `useSectionVisibility.ts` does. */
  resolveAlias: (name: string) => string | undefined;
}

export interface SimulatedPath {
  /** Section ids in visit order, start to finish. */
  visited: string[];
  /** Ids of sections that exist but are not on this path. */
  notVisited: string[];
  /** Edges traversed, using `shared/workflowMap.ts`'s edge-id convention, so the map can highlight them. */
  traversedEdges: string[];
  /** True when the walk hit the iteration cap instead of completing. */
  truncated: boolean;
}

/**
 * `{ id, order }` pairs, in input order — exactly the shape and construction
 * `LogicService.evaluateNavigation()` builds inline
 * (`sections.map((s) => ({ id: s.id, order: s.order }))`) before handing it
 * to `calculateNextSection`/`resolveNextSection`. Deliberately **not**
 * pre-sorted here: both functions already sort internally, and duplicating
 * that sort at this call site would be exactly the kind of "new ordering
 * logic" this module must not introduce.
 */
function toSectionRefs(sections: WorkflowMapSectionInput[]): Array<{ id: string; order: number }> {
  return sections.map((s) => ({ id: s.id, order: s.order }));
}

/**
 * Section ids sorted by `order` — used only for this module's own bookkeeping
 * (`notVisited`'s presentation order, and finding "the last section by
 * order" for `completionEdges`), never for the navigation decision itself.
 * Mirrors the identical sort `buildWorkflowMap` uses for the same purpose.
 */
function sectionIdsByOrder(sections: WorkflowMapSectionInput[]): string[] {
  return [...sections].sort((a, b) => a.order - b.order).map((s) => s.id);
}

/**
 * Edges for the transition out of `sectionId` when navigation says the run
 * is complete (`resolveNextSection` returned `null`). Mirrors
 * `buildWorkflowMap`'s two independent rules for what points at the terminal
 * node: every `final_documents` step in the section gets its own
 * section->step->terminal pair (documents are an ending too, D-2), and the
 * section that is last **by order** additionally gets a direct edge — both
 * can apply to the same section at once, exactly as `buildWorkflowMap` draws
 * them.
 */
function completionEdges(
  sectionId: string,
  orderedSectionIds: string[],
  steps: WorkflowMapStepInput[]
): string[] {
  const edges: string[] = [];

  const finalDocumentSteps = steps.filter((s) => s.sectionId === sectionId && s.type === 'final_documents');
  for (const step of finalDocumentSteps) {
    edges.push(`sequential:${sectionId}->${step.id}`);
    edges.push(`sequential:${step.id}->${WORKFLOW_MAP_TERMINAL_NODE_ID}`);
  }

  const lastSectionId = orderedSectionIds.length > 0 ? orderedSectionIds[orderedSectionIds.length - 1] : null;
  if (lastSectionId !== null && lastSectionId === sectionId) {
    edges.push(`sequential:${sectionId}->${WORKFLOW_MAP_TERMINAL_NODE_ID}`);
  }

  return edges;
}

/**
 * Walk a workflow from the start to completion (or the iteration cap) under
 * a hypothetical answer set, calling `evaluateWorkflowVisibility`,
 * `calculateNextSection` and `resolveNextSection` in the same order
 * `LogicService.evaluateNavigation()` does.
 */
export function simulateWorkflowPath(input: SimulateWorkflowPathInput): SimulatedPath {
  const { sections, steps, rules, data, resolveAlias } = input;
  const sectionRefs = toSectionRefs(sections);
  const orderedSectionIds = sectionIdsByOrder(sections);

  const visited: string[] = [];
  const traversedEdges: string[] = [];
  let currentSectionId: string | null = null;
  let completed = false;

  // A genuine infinite loop should be impossible — `resolveNextSection`'s
  // forward-only guard on skip targets exists precisely to prevent one
  // (RUN2-2). This cap exists for malformed *input* the guard was never
  // designed to catch (e.g. duplicate section ids), where hanging the
  // author's browser would be worse than reporting truncation.
  const iterationCap = sections.length + 1;

  for (let i = 0; i < iterationCap; i++) {
    const visibility = evaluateWorkflowVisibility({
      sections,
      steps,
      rules,
      data,
      resolveAlias,
    });

    const nextSectionId = calculateNextSection(currentSectionId, sectionRefs, visibility.visibleSections);
    const resolvedNextSectionId = resolveNextSection(
      currentSectionId,
      nextSectionId,
      visibility.ruleEvaluation.skipToSectionId,
      sectionRefs,
      visibility.visibleSections
    );

    if (resolvedNextSectionId === null) {
      if (currentSectionId !== null) {
        traversedEdges.push(...completionEdges(currentSectionId, orderedSectionIds, steps));
      }
      completed = true;
      break;
    }

    // A resolved target that differs from the plain next-in-order section
    // can only happen because `resolveNextSection` took the forward-skip
    // branch. `evaluateRules` (`shared/workflowLogic.ts`) already knows which
    // rule won that decision and records it as `skipToRuleId` alongside
    // `skipToSectionId` — read that directly rather than searching `rules`
    // for a rule matching the target section, which can name the wrong rule
    // when two skip_to rules target the same section (only one of them may
    // have actually fired).
    const { skipToSectionId, skipToRuleId } = visibility.ruleEvaluation;
    const usedSkip = skipToSectionId !== undefined && resolvedNextSectionId !== nextSectionId;

    if (usedSkip && skipToRuleId !== undefined) {
      traversedEdges.push(`skip:${skipToRuleId}`);
    } else if (currentSectionId !== null) {
      traversedEdges.push(`sequential:${currentSectionId}->${resolvedNextSectionId}`);
    }

    visited.push(resolvedNextSectionId);
    currentSectionId = resolvedNextSectionId;
  }

  const visitedIds = new Set(visited);
  const notVisited = orderedSectionIds.filter((id) => !visitedIds.has(id));

  return {
    visited,
    notVisited,
    traversedEdges,
    truncated: !completed,
  };
}
