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
 *   1. `evaluateWorkflowVisibility` — which pages/steps are visible, and
 *      whether any `skip_to` rule's condition fired.
 *   2. `calculateNextPage` — the normal (no-skip) next visible page.
 *   3. `resolveNextPage` — the actual next page, letting a *forward*
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
  calculateNextPage,
  evaluateWorkflowVisibility,
  resolveNextPage,
  type EvaluableLogicRule,
} from './workflowLogic';
import {
  WORKFLOW_MAP_TERMINAL_NODE_ID,
  type WorkflowMapPageInput,
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
  pages: WorkflowMapPageInput[];
  steps: WorkflowMapStepInput[];
  rules: SimulationRuleInput[];
  /** Hypothetical answers, keyed by step id (see `resolveAlias`). */
  data: Record<string, unknown>;
  /** Resolves a step alias referenced by a condition to its step id — build it the way `usePageVisibility.ts` does. */
  resolveAlias: (name: string) => string | undefined;
}

export interface SimulatedPath {
  /** Page ids in visit order, start to finish. */
  visited: string[];
  /** Ids of pages that exist but are not on this path. */
  notVisited: string[];
  /** Edges traversed, using `shared/workflowMap.ts`'s edge-id convention, so the map can highlight them. */
  traversedEdges: string[];
  /** True when the walk hit the iteration cap instead of completing. */
  truncated: boolean;
}

/**
 * `{ id, order }` pairs, in input order — exactly the shape and construction
 * `LogicService.evaluateNavigation()` builds inline
 * (`pages.map((s) => ({ id: s.id, order: s.order }))`) before handing it
 * to `calculateNextPage`/`resolveNextPage`. Deliberately **not**
 * pre-sorted here: both functions already sort internally, and duplicating
 * that sort at this call site would be exactly the kind of "new ordering
 * logic" this module must not introduce.
 */
function toPageRefs(pages: WorkflowMapPageInput[]): Array<{ id: string; order: number }> {
  return pages.map((s) => ({ id: s.id, order: s.order }));
}

/**
 * Page ids sorted by `order` — used only for this module's own bookkeeping
 * (`notVisited`'s presentation order, and finding "the last page by
 * order" for `completionEdges`), never for the navigation decision itself.
 * Mirrors the identical sort `buildWorkflowMap` uses for the same purpose.
 */
function pageIdsByOrder(pages: WorkflowMapPageInput[]): string[] {
  return [...pages].sort((a, b) => a.order - b.order).map((s) => s.id);
}

/**
 * Edges for the transition out of `pageId` when navigation says the run
 * is complete (`resolveNextPage` returned `null`). Mirrors
 * `buildWorkflowMap`'s two independent rules for what points at the terminal
 * node: every `final_documents` step in the page gets its own
 * page->step->terminal pair (documents are an ending too, D-2), and the
 * page that is last **by order** additionally gets a direct edge — both
 * can apply to the same page at once, exactly as `buildWorkflowMap` draws
 * them.
 */
function completionEdges(
  pageId: string,
  orderedPageIds: string[],
  steps: WorkflowMapStepInput[]
): string[] {
  const edges: string[] = [];

  const finalDocumentSteps = steps.filter((s) => s.pageId === pageId && s.type === 'final_documents');
  for (const step of finalDocumentSteps) {
    edges.push(`sequential:${pageId}->${step.id}`);
    edges.push(`sequential:${step.id}->${WORKFLOW_MAP_TERMINAL_NODE_ID}`);
  }

  const lastPageId = orderedPageIds.length > 0 ? orderedPageIds[orderedPageIds.length - 1] : null;
  if (lastPageId !== null && lastPageId === pageId) {
    edges.push(`sequential:${pageId}->${WORKFLOW_MAP_TERMINAL_NODE_ID}`);
  }

  return edges;
}

/**
 * Walk a workflow from the start to completion (or the iteration cap) under
 * a hypothetical answer set, calling `evaluateWorkflowVisibility`,
 * `calculateNextPage` and `resolveNextPage` in the same order
 * `LogicService.evaluateNavigation()` does.
 */
export function simulateWorkflowPath(input: SimulateWorkflowPathInput): SimulatedPath {
  const { pages, steps, rules, data, resolveAlias } = input;
  const pageRefs = toPageRefs(pages);
  const orderedPageIds = pageIdsByOrder(pages);

  const visited: string[] = [];
  const traversedEdges: string[] = [];
  let currentPageId: string | null = null;
  let completed = false;

  // A genuine infinite loop should be impossible — `resolveNextPage`'s
  // forward-only guard on skip targets exists precisely to prevent one
  // (RUN2-2). This cap exists for malformed *input* the guard was never
  // designed to catch (e.g. duplicate page ids), where hanging the
  // author's browser would be worse than reporting truncation.
  const iterationCap = pages.length + 1;

  for (let i = 0; i < iterationCap; i++) {
    const visibility = evaluateWorkflowVisibility({
      pages,
      steps,
      rules,
      data,
      resolveAlias,
    });

    const nextPageId = calculateNextPage(currentPageId, pageRefs, visibility.visiblePages);
    const resolvedNextPageId = resolveNextPage(
      currentPageId,
      nextPageId,
      visibility.ruleEvaluation.skipToPageId,
      pageRefs,
      visibility.visiblePages
    );

    if (resolvedNextPageId === null) {
      if (currentPageId !== null) {
        traversedEdges.push(...completionEdges(currentPageId, orderedPageIds, steps));
      }
      completed = true;
      break;
    }

    // A resolved target that differs from the plain next-in-order page
    // can only happen because `resolveNextPage` took the forward-skip
    // branch. `evaluateRules` (`shared/workflowLogic.ts`) already knows which
    // rule won that decision and records it as `skipToRuleId` alongside
    // `skipToPageId` — read that directly rather than searching `rules`
    // for a rule matching the target page, which can name the wrong rule
    // when two skip_to rules target the same page (only one of them may
    // have actually fired).
    const { skipToPageId, skipToRuleId } = visibility.ruleEvaluation;
    const usedSkip = skipToPageId !== undefined && resolvedNextPageId !== nextPageId;

    if (usedSkip && skipToRuleId !== undefined) {
      traversedEdges.push(`skip:${skipToRuleId}`);
    } else if (currentPageId !== null) {
      traversedEdges.push(`sequential:${currentPageId}->${resolvedNextPageId}`);
    }

    visited.push(resolvedNextPageId);
    currentPageId = resolvedNextPageId;
  }

  const visitedIds = new Set(visited);
  const notVisited = orderedPageIds.filter((id) => !visitedIds.has(id));

  return {
    visited,
    notVisited,
    traversedEdges,
    truncated: !completed,
  };
}
