/**
 * Static key for the map's node/edge vocabulary. Reinforces MAP-4 AC5/AC7's
 * "more than color" requirement — every entry pairs its swatch with an icon
 * and a text label, so the legend itself doesn't rely on color to be read.
 */
import { CheckCircle2, FileText, GitBranch, Layers } from "lucide-react";

export function MapLegend() {
  return (
    <div
      aria-label="Map legend"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-[var(--map-page-bg)] px-4 py-2 text-xs text-muted-foreground"
    >
      <span className="inline-flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        Page
      </span>
      <span className="inline-flex items-center gap-1.5">
        <GitBranch className="h-3.5 w-3.5 text-[var(--map-conditional-accent)]" aria-hidden="true" />
        Conditional (dashed border)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5 text-[var(--map-doc-fg)]" aria-hidden="true" />
        Final documents
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--map-terminal-fg)]" aria-hidden="true" />
        Complete
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true">
          <line x1="0" y1="4" x2="18" y2="4" stroke="var(--map-skip-line)" strokeWidth="2" strokeDasharray="4 3" />
        </svg>
        Skip route
      </span>
    </div>
  );
}
