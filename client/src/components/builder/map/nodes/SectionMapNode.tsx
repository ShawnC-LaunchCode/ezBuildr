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
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch, Layers } from "lucide-react";

import type { MapFlowNode } from "../types";

export function SectionMapNode({ data }: NodeProps<MapFlowNode>) {
  const borderStyle = data.conditional
    ? "border-dashed border-[var(--map-conditional-border)]"
    : "border-solid border-[var(--map-section-border)]";

  return (
    <div
      role="group"
      aria-label={data.conditional ? `${data.label} — conditional section` : `${data.label} — section`}
      className={`min-w-[200px] max-w-[240px] overflow-hidden rounded-xl border-2 bg-[var(--map-section-bg)] shadow-sm ${borderStyle}`}
    >
      <Handle type="target" position={Position.Top} />
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
