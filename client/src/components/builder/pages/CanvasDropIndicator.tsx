import { useDroppable } from "@dnd-kit/core";
import { MoveDown } from "lucide-react";

import { cn } from "@/lib/utils";

import { landingDragId } from "@/lib/dnd";

interface CanvasLandingRailProps {
  index: number;
  label: string;
  enabled: boolean;
}

export function CanvasLandingRail({ index, label, enabled }: CanvasLandingRailProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: landingDragId(index),
    disabled: !enabled,
    data: {
      kind: "landing",
      insertIndex: index,
      sectionId: null,
      label,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "grid overflow-hidden transition-[grid-template-rows,opacity] duration-150 motion-reduce:transition-none",
        enabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
      aria-hidden={!enabled}
      data-canvas-landing={index}
    >
      <div className="min-h-0">
        <div
          className={cn(
            "my-1 flex h-7 items-center justify-center gap-1.5 rounded-md border border-dashed px-3 text-[11px] font-medium",
            "border-border/70 bg-muted/20 text-muted-foreground",
            isOver && "border-primary/70 bg-primary/10 text-foreground ring-1 ring-primary/30",
          )}
        >
          <MoveDown className="size-3" aria-hidden="true" />
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}

interface PageDropIndicatorProps {
  label: string | null;
}

export function PageDropIndicator({ label }: PageDropIndicatorProps) {
  if (!label) {
    return null;
  }

  return (
    <div
      className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-primary"
      data-page-drop-indicator="true"
    >
      <span className="h-px flex-1 bg-primary/70" aria-hidden="true" />
      <span className="rounded-sm bg-primary/10 px-2 py-1">{label}</span>
      <span className="h-px flex-1 bg-primary/70" aria-hidden="true" />
    </div>
  );
}
