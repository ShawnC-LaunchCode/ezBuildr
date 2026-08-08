/**
 * The single synthetic "Complete" node (D-2's stand-in for GH-153 AC1's
 * "endings" — there is no ending entity in this schema). Deliberately not
 * activatable: MAP-5 (a later ticket) wires node-click-to-inspector
 * navigation, and the terminal node has no section/step behind it to open,
 * so it must expose no button/link role and must not look clickable —
 * a plain `<div>`, no `tabIndex`, no cursor-pointer.
 */
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CheckCircle2 } from "lucide-react";

import type { MapFlowNode } from "../types";

export function TerminalMapNode({ data }: NodeProps<MapFlowNode>) {
  return (
    <div
      role="img"
      aria-label="Workflow complete"
      className="flex items-center gap-1.5 rounded-full border-2 border-[var(--map-terminal-border)] bg-[var(--map-terminal-bg)] px-4 py-2 shadow-sm"
    >
      <Handle type="target" position={Position.Top} />
      <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--map-terminal-fg)]" aria-hidden="true" />
      <span className="text-sm font-semibold text-[var(--map-terminal-fg)]">{data.label}</span>
    </div>
  );
}
