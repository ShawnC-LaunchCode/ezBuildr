/**
 * A map node for a section (D-2: "a map node is a section"). MAP-4 AC5:
 * a conditional section is marked by more than color — a dashed border
 * *and* a labelled badge with its own icon and visible text, so the
 * distinction survives grayscale/colorblind rendering, not just a hover
 * tooltip. Asserted in tests by the badge's text/role, not by class name.
 *
 * MAP-5 (GH-153 AC2/AC4): the card's content sits inside a real `<button>`
 * so activation (click, Enter or Space) is native, focusable and correctly
 * labelled — `data.onActivate` navigates via a URL (see `MapTab`), never the
 * builder store. The outer `role="group"` card is kept as the semantic
 * container so the section's conditional-state a11y name (used by MAP-4's
 * own tests) is unaffected by the nested control.
 *
 * MAP-6: `data.findings` are lint findings the server already computed
 * (`GET /api/workflows/:id/lint`) whose `target.sectionId` is this node's id
 * — never anything this component derives itself. An error outranks a
 * warning for the badge's overall severity, but the message list underneath
 * still lists every finding. The badge is its own `<button>`, a sibling of
 * the activation button rather than nested inside it — nesting two
 * interactive elements is invalid HTML and would swallow the inner one's
 * clicks/focus.
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, GitBranch, Layers, XCircle } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import type { MapFlowNode } from "../types";

export function SectionMapNode({ data }: NodeProps<MapFlowNode>) {
  const borderStyle = data.conditional
    ? "border-dashed border-[var(--map-conditional-border)]"
    : "border-solid border-[var(--map-section-border)]";

  const findings = data.findings;
  const errorCount = findings.filter((f) => f.type === "error").length;
  const warningCount = findings.length - errorCount;
  const severity: "error" | "warning" | null = errorCount > 0 ? "error" : warningCount > 0 ? "warning" : null;

  return (
    <div
      role="group"
      aria-label={data.conditional ? `${data.label} — conditional section` : `${data.label} — section`}
      className={`relative min-w-[200px] max-w-[240px] overflow-hidden rounded-xl border-2 bg-[var(--map-section-bg)] shadow-sm ${borderStyle}`}
    >
      <Handle type="target" position={Position.Top} />
      {severity && (
        <div className="absolute right-1.5 top-1.5 z-10">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`${data.label}: ${errorCount} ${errorCount === 1 ? "error" : "errors"}, ${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`}
                  className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    severity === "error"
                      ? "border-[var(--map-error-border)] bg-[var(--map-error-bg)] text-[var(--map-error-fg)]"
                      : "border-[var(--map-warning-border)] bg-[var(--map-warning-bg)] text-[var(--map-warning-fg)]"
                  }`}
                >
                  {severity === "error" ? (
                    <XCircle className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  )}
                  <span>{findings.length}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-medium">{severity === "error" ? "Blocking error" : "Warning"}</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {findings.map((finding) => (
                    <li key={`${finding.type}-${finding.message}`}>{finding.message}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      <button
        type="button"
        disabled={!data.onActivate}
        onClick={(event) => {
          event.stopPropagation();
          data.onActivate?.();
        }}
        aria-label={`Open ${data.label} section`}
        className="block w-full px-4 py-3 text-left outline-none transition-colors hover:bg-[var(--map-hover-bg)] focus-visible:bg-[var(--map-hover-bg)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
      >
        <div className="flex items-start gap-2">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-[var(--map-section-fg)] opacity-60" aria-hidden="true" />
          <span className="text-sm font-medium leading-snug text-[var(--map-section-fg)]">{data.label}</span>
        </div>
        {data.conditional && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--map-conditional-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--map-conditional-accent)]">
            <GitBranch className="h-3 w-3" aria-hidden="true" />
            <span>Conditional</span>
          </div>
        )}
      </button>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
