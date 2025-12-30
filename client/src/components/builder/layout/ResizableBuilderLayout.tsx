import React, { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
const DEFAULT_LEFT_WIDTH = 280;
const DEFAULT_RIGHT_WIDTH = 400;

export function ResizableBuilderLayout({
  leftPanel,
  centerPanel,
  rightPanel,
  workflowId,
  rightPanelOpen,
  onRightPanelToggle,
}: ResizableBuilderLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);

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
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const { left, right } = JSON.parse(saved);
        if (left) setLeftWidth(left);
        if (right) setRightWidth(right);
        // We don't load collapsed state if it's controlled externally
        if (rightPanelOpen === undefined && JSON.parse(saved).rightCollapsed !== undefined) {
          setInternalRightCollapsed(JSON.parse(saved).rightCollapsed);
        }
      }
    } catch (error) {
      console.error("Failed to load layout preferences:", error);
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
          rightCollapsed: isRightCollapsed,
        })
      );
    } catch (error) {
      console.error("Failed to save layout preferences:", error);
    }
  }, [leftWidth, rightWidth, isRightCollapsed, storageKey]);

  // Handle left resize
  useEffect(() => {
    if (!isDraggingLeft) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      if (newWidth >= MIN_PANEL_WIDTH && newWidth <= containerRect.width - MIN_PANEL_WIDTH) {
        setLeftWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLeft]);

  // Handle right resize
  useEffect(() => {
    if (!isDraggingRight) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;

      if (newWidth >= MIN_PANEL_WIDTH && newWidth <= containerRect.width - MIN_PANEL_WIDTH) {
        setRightWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingRight(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingRight]);

  const handleToggleRight = () => {
    const newState = !isRightCollapsed;
    if (onRightPanelToggle) {
      onRightPanelToggle(!newState); // Toggle "Open" state
    } else {
      setInternalRightCollapsed(newState);
    }
  };

  return (
    <div ref={containerRef} className="flex h-full w-full relative overflow-hidden">
      {/* Left Panel */}
      <div
        style={{ width: `${leftWidth}px` }}
        className="flex-shrink-0 border-r bg-background overflow-hidden relative"
      >
        <div className="h-full w-full overflow-y-auto">
          {leftPanel}
        </div>
      </div>

      {/* Left Resize Handle */}
      <div
        className={cn(
          "w-1 cursor-col-resize hover:bg-blue-400 transition-colors flex-shrink-0 z-10",
          isDraggingLeft && "bg-blue-500"
        )}
        onMouseDown={() => setIsDraggingLeft(true)}
      />

      {/* Center Panel (flexible) */}
      <div className="flex-1 overflow-hidden min-w-0 bg-background relative z-0">
        {centerPanel}
      </div>

      {/* Right Panel (AI Assistant) */}
      {rightPanel && (
        <>
          {/* Right Resize Handle (only when not collapsed) */}
          {!isRightCollapsed && (
            <div
              className={cn(
                "w-1 cursor-col-resize hover:bg-purple-400 transition-colors flex-shrink-0 z-10",
                isDraggingRight && "bg-purple-500"
              )}
              onMouseDown={() => setIsDraggingRight(true)}
            />
          )}

          {/* Right Panel */}
          <div
            style={{
              width: isRightCollapsed ? "0px" : `${rightWidth}px`,
            }}
            className={cn(
              "flex-shrink-0 border-l bg-background transition-all duration-300 overflow-hidden relative",
              isRightCollapsed && "border-l-0"
            )}
          >
            <div className="h-full w-full overflow-hidden">
              {rightPanel}
            </div>
          </div>

          {/* Right Panel Toggle Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleToggleRight}
            className={cn(
              "absolute right-0 top-1/2 -translate-y-1/2 z-20",
              "rounded-l-md rounded-r-none border border-r-0",
              "bg-background hover:bg-accent shadow-md",
              isRightCollapsed ? "translate-x-0" : ""
            )}
            style={{
              right: isRightCollapsed ? "0" : `${rightWidth}px`,
              transition: "right 0.3s ease-in-out"
            }}
          >
            {isRightCollapsed ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        </>
      )}

      {/* Drag overlay to prevent text selection */}
      {(isDraggingLeft || isDraggingRight) && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}
    </div>
  );
}
