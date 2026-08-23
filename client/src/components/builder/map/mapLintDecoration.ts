/**
 * Attaches `GET /api/workflows/:id/lint` findings (MAP-3's server-side flow
 * analysis, surfaced through `lintWorkflowContent`) to the map's own nodes,
 * for MAP-6.
 *
 * Pure — no React, no `@xyflow/react` — so the matching/grouping logic is
 * unit-testable on its own, same discipline as `mapLayout.ts` and
 * `toFlowElements.ts`.
 *
 * ⚠️ This module computes **no diagnostics of its own**. It only groups
 * findings the server already produced by `target.pageId`. The map's own
 * graph (`shared/workflowMap.ts`) and the lint's graph
 * (`server/services/workflowLintRules.ts`) deliberately disagree on
 * reachability — see the note on MAP-6 in
 * `tickets/backlog/WORKFLOW_MAP.md` — so re-deriving anything client-side
 * here would silently reintroduce that disagreement.
 */
import type { WorkflowLintIssue } from "@shared/types/workflowLint";

export interface MapLintDecoration {
  /** Findings keyed by the map node id they attach to (`target.pageId`). */
  byPage: Map<string, WorkflowLintIssue[]>;
  /**
   * Findings that name a `target.pageId`, but it matches no node on this
   * map (e.g. a stale reference to a deleted page). MAP-6 AC5: these must
   * still be counted, never dropped.
   */
  unmatched: WorkflowLintIssue[];
}

export interface MapFindingsSummaryCounts {
  errors: number;
  warnings: number;
  unmatched: number;
}

const EMPTY_DECORATION: MapLintDecoration = { byPage: new Map(), unmatched: [] };

/**
 * Groups lint findings by the map node they belong to. A finding with no
 * `target.pageId` at all (e.g. a document/template finding) isn't
 * map-relevant — the map only ever renders page-shaped nodes — and is
 * silently excluded from both the decoration and the summary count.
 */
export function decorateMapFindings(
  issues: readonly WorkflowLintIssue[],
  nodeIds: ReadonlySet<string>
): MapLintDecoration {
  if (issues.length === 0) {
    return EMPTY_DECORATION;
  }

  const byPage = new Map<string, WorkflowLintIssue[]>();
  const unmatched: WorkflowLintIssue[] = [];

  for (const issue of issues) {
    const pageId = issue.target.pageId;
    if (!pageId) {
      continue;
    }
    if (nodeIds.has(pageId)) {
      const existing = byPage.get(pageId);
      if (existing) {
        existing.push(issue);
      } else {
        byPage.set(pageId, [issue]);
      }
    } else {
      unmatched.push(issue);
    }
  }

  return { byPage, unmatched };
}

/** Totals for the map's summary bar — every map-relevant finding, matched or not. */
export function summarizeMapFindings(decoration: MapLintDecoration): MapFindingsSummaryCounts {
  let errors = 0;
  let warnings = 0;

  for (const nodeIssues of decoration.byPage.values()) {
    for (const issue of nodeIssues) {
      if (issue.type === "error") { errors++; } else { warnings++; }
    }
  }
  for (const issue of decoration.unmatched) {
    if (issue.type === "error") { errors++; } else { warnings++; }
  }

  return { errors, warnings, unmatched: decoration.unmatched.length };
}
