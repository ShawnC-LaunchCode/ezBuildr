/**
 * A map node for a `final_documents` step (D-2: an *additional* node
 * downstream of its owning section, not a replacement for it). MAP-4 AC3:
 * visually distinct from a section node by shape cue (pill, not a card),
 * icon and an explicit "Final Documents" label — not by color alone.
 *
 * MAP-5 (GH-153 AC2/AC4): activation navigates with the underlying step's
 * id (`stepId`, not `sectionId`) — per D-2 a `final_documents` node's own id
 * *is* the step id. See `SectionMapNode` for why the interactive surface is
 * a nested `<button>` rather than the outer `role="group"` card itself.
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";

import type { MapFlowNode } from "../types";

export function FinalDocumentsMapNode({ data }: NodeProps<MapFlowNode>) {
  return (
    <div
      role="group"
      aria-label={`${data.label} — final documents`}
      className="min-w-[190px] max-w-[220px] overflow-hidden rounded-full border-2 border-dotted border-[var(--map-doc-border)] bg-[var(--map-doc-bg)] shadow-sm"
    >
      <Handle type="target" position={Position.Left} />
      <button
        type="button"
        disabled={!data.onActivate}
        onClick={(event) => {
          event.stopPropagation();
          data.onActivate?.();
        }}
        aria-label={`Open ${data.label} final documents`}
        className="block w-full px-4 py-2.5 text-left outline-none transition-colors hover:bg-[var(--map-hover-bg)] focus-visible:bg-[var(--map-hover-bg)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent"
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-[var(--map-doc-fg)]" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--map-doc-fg)] opacity-80">
              Final Documents
            </div>
            <div className="truncate text-sm font-medium text-[var(--map-doc-fg)]">{data.label}</div>
          </div>
        </div>
      </button>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
