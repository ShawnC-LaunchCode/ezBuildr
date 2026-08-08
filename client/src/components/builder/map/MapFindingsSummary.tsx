/**
 * A summary bar for the map's flow-diagnostic findings (MAP-6). Exists for
 * AC5: a finding whose `target.sectionId` matches no node on the map must
 * still be counted somewhere visible rather than silently dropped — the
 * "not shown on the map" line below is that surface. Renders nothing when
 * there is nothing to report, so a clean workflow's map stays uncluttered.
 */
import { AlertTriangle, XCircle } from "lucide-react";

import type { MapFindingsSummaryCounts } from "./mapLintDecoration";

interface MapFindingsSummaryProps {
  counts: MapFindingsSummaryCounts;
}

export function MapFindingsSummary({ counts }: MapFindingsSummaryProps) {
  if (counts.errors === 0 && counts.warnings === 0) {
    return null;
  }

  return (
    <div
      aria-label="Map findings summary"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-[var(--map-section-bg)] px-4 py-1.5 text-xs"
    >
      {counts.errors > 0 && (
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--map-error-fg)]">
          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
          {counts.errors} blocking {counts.errors === 1 ? "error" : "errors"}
        </span>
      )}
      {counts.warnings > 0 && (
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--map-warning-fg)]">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          {counts.warnings} {counts.warnings === 1 ? "warning" : "warnings"}
        </span>
      )}
      {counts.unmatched > 0 && (
        <span className="text-muted-foreground">
          {counts.unmatched} {counts.unmatched === 1 ? "finding isn't" : "findings aren't"} shown on the map
        </span>
      )}
    </div>
  );
}
