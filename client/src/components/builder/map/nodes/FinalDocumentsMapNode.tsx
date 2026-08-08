/**
 * A map node for a `final_documents` step (D-2: an *additional* node
 * downstream of its owning section, not a replacement for it). MAP-4 AC3:
 * visually distinct from a section node by shape cue (pill, not a card),
 * icon and an explicit "Final Documents" label — not by color alone.
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";

import type { MapFlowNode } from "../types";

export function FinalDocumentsMapNode({ data }: NodeProps<MapFlowNode>) {
  return (
    <div
      role="group"
      aria-label={`${data.label} — final documents`}
      className="min-w-[190px] max-w-[220px] rounded-full border-2 border-dotted border-[var(--map-doc-border)] bg-[var(--map-doc-bg)] px-4 py-2.5 shadow-sm"
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-[var(--map-doc-fg)]" aria-hidden="true" />
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--map-doc-fg)] opacity-80">
            Final Documents
          </div>
          <div className="truncate text-sm font-medium text-[var(--map-doc-fg)]">{data.label}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
