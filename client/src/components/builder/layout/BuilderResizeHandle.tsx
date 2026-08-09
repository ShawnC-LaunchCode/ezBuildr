import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

import type React from "react";

/** Arrow-key nudge, and the larger jump when Shift is held. */
const KEYBOARD_STEP_PX = 16;
const KEYBOARD_STEP_LARGE_PX = 64;

interface BuilderResizeHandleProps {
  /** Which panel this handle sizes — decides which way an arrow key grows it. */
  side: "left" | "right";
  label: string;
  width: number;
  min: number;
  max: number;
  isDragging: boolean;
  onDragStart: () => void;
  onWidthChange: (width: number) => void;
  /** Width restored on double-click. */
  defaultWidth: number;
}

/**
 * The divider between the builder shell's panels.
 *
 * Replaces a bare 4px `<div>` that had no grip, no keyboard path, and no
 * accessible role — the AI panel was resizable but gave no sign of it, while
 * the outline splitter beside it (react-resizable-panels) showed a grip. This
 * matches that affordance and adds what neither had: arrow-key resizing and a
 * double-click reset.
 */
export function BuilderResizeHandle({
  side,
  label,
  width,
  min,
  max,
  isDragging,
  onDragStart,
  onWidthChange,
  defaultWidth,
}: BuilderResizeHandleProps) {
  const clamp = (value: number) => Math.min(max, Math.max(min, value));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Home") {
      e.preventDefault();
      onWidthChange(min);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      onWidthChange(max);
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
      return;
    }
    e.preventDefault();
    const step = e.shiftKey ? KEYBOARD_STEP_LARGE_PX : KEYBOARD_STEP_PX;
    // ArrowRight always moves the divider right; whether that grows or shrinks
    // the panel depends on which side of it the panel sits.
    const towardsRight = e.key === "ArrowRight" ? 1 : -1;
    const delta = side === "left" ? towardsRight : -towardsRight;
    onWidthChange(clamp(width + delta * step));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      onMouseDown={onDragStart}
      onDoubleClick={() => onWidthChange(clamp(defaultWidth))}
      onKeyDown={handleKeyDown}
      data-dragging={isDragging}
      className={cn(
        "group relative z-10 flex w-px shrink-0 cursor-col-resize items-center justify-center",
        "bg-border transition-colors",
        // A 1px line is not a 1px pointer target — widen the hit area without
        // widening the line.
        "after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2",
        "hover:bg-primary/60 data-[dragging=true]:bg-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div
        className={cn(
          "z-10 flex h-5 w-3 items-center justify-center rounded-sm border bg-border",
          "transition-colors group-hover:border-primary/60 group-hover:bg-primary/10",
          "group-data-[dragging=true]:border-primary group-data-[dragging=true]:bg-primary/20",
        )}
      >
        <GripVertical className="size-2.5 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  );
}
