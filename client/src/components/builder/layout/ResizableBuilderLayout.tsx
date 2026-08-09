
import { ChevronRight, ChevronLeft } from "lucide-react";
import React, { useState, useRef, useEffect, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

import { BuilderResizeHandle } from "./BuilderResizeHandle";
import { cn } from "@/lib/utils";

interface ResizableBuilderLayoutProps {
  leftPanel: React.ReactNode;
  centerPanel: React.ReactNode;
  rightPanel?: React.ReactNode;
  workflowId?: string;
  // Control props for right panel
  rightPanelOpen?: boolean;
  onRightPanelToggle?: (isOpen: boolean) => void;
}

const STORAGE_KEY_PREFIX = "builder-layout-widths";
const MIN_PANEL_WIDTH = 200;
/**
 * Drag a panel narrower than this and it collapses instead of sticking at the
 * minimum — the divider becomes the way to close a panel, not just size it.
 * The stored width is left untouched below MIN_PANEL_WIDTH, so reopening
 * restores the last usable size rather than a sliver.
 */
const COLLAPSE_SNAP_WIDTH = 100;
/**
 * Width of the rail a collapsed panel leaves behind to hold its own reopen
 * control. The control used to float at `left: 0` over whatever panel was
 * beside it — which put it on top of the outline's section chevrons, styled
 * like them, swallowing the one it covered. Reserving a column costs 32px and
 * makes that impossible.
 */
const COLLAPSED_RAIL_WIDTH = 32;
const DEFAULT_LEFT_WIDTH = 280;
const DEFAULT_RIGHT_WIDTH = 400;

interface SavedLayoutPreferences {
  left?: number;
  right?: number;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
}

function loadLayoutPreferences(storageKey: string): SavedLayoutPreferences | null {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) as SavedLayoutPreferences : null;
  } catch (error) {
    console.error("Failed to load layout preferences:", error);
    return null;
  }
}

function LeftPanelToggle({
  collapsed,
  panelWidth,
  onToggle,
}: {
  collapsed: boolean;
  panelWidth: number;
  onToggle: () => void;
}) {
  const label = collapsed ? "Show navigation panel" : "Hide navigation panel";
  // Collapsed, this sits inside its own rail and needs no positioning; only
  // the expanded state floats, and then only over its own panel's edge.
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={cn(
        "z-20 hover:bg-accent",
        collapsed
          ? "size-8 rounded-md p-0"
          : "absolute top-1/2 -translate-y-1/2 rounded-l-none rounded-r-md border border-l-0 bg-background shadow-md",
      )}
      style={
        collapsed
          ? undefined
          : { left: `${panelWidth}px`, transition: "left 0.2s ease-in-out" }
      }
    >
      {collapsed ? (
        <ChevronRight className="w-4 h-4" />
      ) : (
        <ChevronLeft className="w-4 h-4" />
      )}
    </Button>
  );
}

/**
 * Shell classes for a side panel. The width transition animates collapse and
 * expand, but during a drag it makes the edge lag the cursor and feel rubbery,
 * so it is suppressed mid-drag.
 */
function panelShellClass(opts: {
  side: "left" | "right";
  collapsed: boolean;
  dragging: boolean;
}): string {
  return cn(
    "relative flex-shrink-0 overflow-hidden bg-background",
    opts.side === "left" ? "border-r" : "border-l",
    !opts.dragging &&
      (opts.side === "left"
        ? "transition-[width] duration-200"
        : "transition-[width] duration-300"),
    opts.collapsed && (opts.side === "left" ? "border-r-0" : "border-l-0"),
  );
}

/**
 * Window-level pointer tracking for a panel drag. Both edges ran an identical
 * copy of this inline; sharing it keeps the min/max clamp in one place.
 */
function usePanelDrag({
  active,
  containerRef,
  side,
  onWidth,
  onEnd,
  onSnapClosed,
}: {
  active: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  side: "left" | "right";
  onWidth: (width: number) => void;
  onEnd: () => void;
  onSnapClosed: () => void;
}): void {
  useEffect(() => {
    if (!active) { return; }

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) { return; }
      const rect = container.getBoundingClientRect();
      const newWidth =
        side === "left" ? e.clientX - rect.left : rect.right - e.clientX;

      if (newWidth < COLLAPSE_SNAP_WIDTH) {
        // Snap shut mid-drag rather than on release, so the panel closes under
        // the cursor and the drag ends with it — releasing over a collapsed
        // panel would otherwise keep an invisible drag alive.
        onSnapClosed();
        onEnd();
        return;
      }
      if (newWidth > rect.width - MIN_PANEL_WIDTH) { return; }
      // Between the snap point and the minimum the edge holds at the minimum,
      // which gives the collapse a bit of resistance instead of a hair trigger.
      onWidth(Math.max(MIN_PANEL_WIDTH, newWidth));
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", onEnd);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", onEnd);
    };
  }, [active, containerRef, side, onWidth, onEnd, onSnapClosed]);
}

/**
 * The AI assistant column: resize handle, panel, and whichever of the two
 * collapse controls applies. Extracted so the shell's own render stays about
 * layout rather than the panel's five conditional pieces.
 */
function RightPanelRegion({
  panel,
  collapsed,
  width,
  widthStyle,
  maxWidth,
  isMobile,
  isDragging,
  onDragStart,
  onWidthChange,
  onToggle,
}: {
  panel: React.ReactNode;
  collapsed: boolean;
  width: number;
  widthStyle: string;
  maxWidth: number;
  isMobile: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onWidthChange: (width: number) => void;
  onToggle: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (!panel) {
    return null;
  }

  return (
    <>
      {/* Resizing is meaningless when the panel is full-width on mobile. */}
      {!collapsed && !isMobile && (
        <BuilderResizeHandle
          side="right"
          label="Resize AI assistant panel"
          width={width}
          min={MIN_PANEL_WIDTH}
          max={maxWidth}
          defaultWidth={DEFAULT_RIGHT_WIDTH}
          isDragging={isDragging}
          onDragStart={onDragStart}
          onWidthChange={onWidthChange}
        />
      )}

      <div
        style={{ width: widthStyle }}
        className={panelShellClass({ side: "right", collapsed, dragging: isDragging })}
      >
        <div className="h-full w-full overflow-hidden">{panel}</div>
      </div>

      {/* Collapsed rail — the reopen control gets a reserved column instead of
          sitting on top of the canvas. */}
      {collapsed && (
        <div
          style={{ width: `${COLLAPSED_RAIL_WIDTH}px` }}
          className="flex shrink-0 items-center justify-center border-l bg-muted/30"
        >
          <Button
            size="sm"
            variant="ghost"
            aria-label="Show AI assistant"
            title="Show AI assistant"
            onClick={onToggle}
            className="z-20 size-8 rounded-md p-0 hover:bg-accent"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Open: the collapse control floats on its own panel's edge. */}
      {!collapsed && (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Hide AI assistant"
          title="Hide AI assistant"
          onClick={onToggle}
          className={cn(
            "absolute top-1/2 z-20 -translate-y-1/2",
            "rounded-l-md rounded-r-none border border-r-0",
            "bg-background shadow-md hover:bg-accent",
          )}
          style={{
            right: isMobile ? "0px" : `${width}px`,
            transition: "right 0.3s ease-in-out",
          }}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}
    </>
  );
}

export function ResizableBuilderLayout({
  leftPanel,
  centerPanel,
  rightPanel,
  workflowId,
  rightPanelOpen,
  onRightPanelToggle,
}: ResizableBuilderLayoutProps) {
  // Sidebar itself is `hidden md:flex`, but this layout still reserved its
  // 280px column below that breakpoint — a dead band that left ~77px of a
  // 390px screen for the actual builder. Below md there is nothing to show,
  // so the panel, its rail and its handle are all dropped.
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);

  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);

  // Internal state for right panel if not controlled externally
  const [internalRightCollapsed, setInternalRightCollapsed] = useState(true);

  // Derived state
  const isRightCollapsed = rightPanelOpen !== undefined ? !rightPanelOpen : internalRightCollapsed;

  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const storageKey = workflowId
    ? `${STORAGE_KEY_PREFIX}-${workflowId}`
    : `${STORAGE_KEY_PREFIX}-global`;

  // Load saved widths from localStorage
  useEffect(() => {
    const parsed = loadLayoutPreferences(storageKey);
    if (!parsed) {
      return;
    }
    setLeftWidth((current) => parsed.left ?? current);
    setRightWidth((current) => parsed.right ?? current);
    setIsLeftCollapsed((current) => parsed.leftCollapsed ?? current);
    // We don't load collapsed state if it's controlled externally
    if (rightPanelOpen === undefined && parsed.rightCollapsed !== undefined) {
      setInternalRightCollapsed(parsed.rightCollapsed);
    }
  }, [storageKey, rightPanelOpen]);

  // Save widths to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          left: leftWidth,
          right: rightWidth,
          leftCollapsed: isLeftCollapsed,
          rightCollapsed: isRightCollapsed,
        })
      );
    } catch (error) {
      console.error("Failed to save layout preferences:", error);
    }
  }, [leftWidth, rightWidth, isLeftCollapsed, isRightCollapsed, storageKey]);

  const collapseRight = useCallback(() => {
    if (onRightPanelToggle) {
      onRightPanelToggle(false);
    } else {
      setInternalRightCollapsed(true);
    }
  }, [onRightPanelToggle]);

  usePanelDrag({
    active: isDraggingLeft,
    containerRef,
    side: "left",
    onWidth: setLeftWidth,
    onEnd: () => setIsDraggingLeft(false),
    onSnapClosed: () => setIsLeftCollapsed(true),
  });

  usePanelDrag({
    active: isDraggingRight,
    containerRef,
    side: "right",
    onWidth: setRightWidth,
    onEnd: () => setIsDraggingRight(false),
    onSnapClosed: collapseRight,
  });

  // Below md the navigation column has nothing to render, so it and its
  // chrome are dropped entirely rather than reserved.
  const isDesktop = !isMobile;
  const leftPanelWidth = isLeftCollapsed || isMobile ? "0px" : `${leftWidth}px`;
  const rightPanelWidth = isRightCollapsed
    ? "0px"
    : isMobile
      ? "100%"
      : `${rightWidth}px`;

  // Same bound the drag handlers enforce, so keyboard resizing stops where
  // dragging does. Falls back to the window before the container measures.
  const containerWidth =
    containerRef.current?.getBoundingClientRect().width ??
    (typeof window === "undefined" ? 0 : window.innerWidth);
  const maxPanelWidth = Math.max(MIN_PANEL_WIDTH, containerWidth - MIN_PANEL_WIDTH);

  const handleToggleRight = () => {
    const newState = !isRightCollapsed;
    if (onRightPanelToggle) {
      onRightPanelToggle(!newState); // Toggle "Open" state
    } else {
      setInternalRightCollapsed(newState);
    }
  };

  return (
    // h-screen, not h-full: nothing above this gives the builder a definite
    // height, so `h-full` fell back to auto and the row simply grew to its
    // tallest child. A long AI conversation then stretched the whole shell
    // past the viewport and pushed the composer below the fold. Pinning the
    // shell to the viewport is what lets every `h-full` / `min-h-0` chain
    // inside it resolve and scroll instead of grow.
    <div ref={containerRef} className="relative flex h-screen w-full overflow-hidden">
      {/* Left Panel */}
      <div
        style={{ width: leftPanelWidth }}
        className={panelShellClass({
          side: "left",
          collapsed: isLeftCollapsed,
          dragging: isDraggingLeft,
        })}
      >
        <div className="h-full w-full overflow-y-auto">
          {leftPanel}
        </div>
      </div>

      {/* Left Resize Handle */}
      {!isLeftCollapsed && isDesktop && (
        <BuilderResizeHandle
          side="left"
          label="Resize navigation panel"
          width={leftWidth}
          min={MIN_PANEL_WIDTH}
          max={maxPanelWidth}
          defaultWidth={DEFAULT_LEFT_WIDTH}
          isDragging={isDraggingLeft}
          onDragStart={() => setIsDraggingLeft(true)}
          onWidthChange={setLeftWidth}
        />
      )}

      {/* Collapsed rail — the reopen control gets its own column rather than
          floating over the panel next door. */}
      {isLeftCollapsed && isDesktop && (
        <div
          style={{ width: `${COLLAPSED_RAIL_WIDTH}px` }}
          className="flex shrink-0 items-center justify-center border-r bg-muted/30"
        >
          <LeftPanelToggle
            collapsed
            panelWidth={leftWidth}
            onToggle={() => setIsLeftCollapsed(false)}
          />
        </div>
      )}

      {/* Center Panel (flexible) */}
      <div className="flex-1 overflow-hidden min-w-0 bg-background relative z-0">
        {centerPanel}
      </div>

      {!isLeftCollapsed && isDesktop && (
        <LeftPanelToggle
          collapsed={false}
          panelWidth={leftWidth}
          onToggle={() => setIsLeftCollapsed(true)}
        />
      )}

      <RightPanelRegion
        panel={rightPanel}
        collapsed={isRightCollapsed}
        width={rightWidth}
        widthStyle={rightPanelWidth}
        maxWidth={maxPanelWidth}
        isMobile={isMobile}
        isDragging={isDraggingRight}
        onDragStart={() => setIsDraggingRight(true)}
        onWidthChange={setRightWidth}
        onToggle={handleToggleRight}
      />

      {/* Drag overlay to prevent text selection */}
      {(isDraggingLeft || isDraggingRight) && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}
    </div>
  );
}
