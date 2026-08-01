/**
 * Drill-in navigation state for the runner's List block (LIST-8). Only one
 * List step can be drilled into at a time per section — entering a list
 * takes over the whole section body (see ListDrillEditor / WorkflowRunner),
 * so a single stack, not one per step, is all that's needed.
 *
 * Browser back support (AC9): every level entered pushes one history entry;
 * every level left — whether by the hardware/gesture back button, "← parent",
 * or "Done" — goes through `window.history.back()`, and the actual state
 * change happens in the resulting `popstate` handler. Routing every pop
 * through the same path keeps the two in sync by construction, rather than
 * maintaining two separate "go up one level" implementations that could
 * drift apart. There is deliberately no "jump back N levels" — the ticket
 * only asks for single-level pops (← parent / Done / hardware back), and a
 * breadcrumb is pure display here, not a set of independently clickable
 * crumbs.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { DrillSegment } from "./listRuntime";

export interface ListDrillState {
  stepId: string;
  segments: DrillSegment[];
}

interface ListDrillContextValue {
  drill: ListDrillState | null;
  /** Opens the top-level list for `stepId` at `segment` (fieldAlias is always null for this first segment). */
  enterList: (stepId: string, segment: DrillSegment) => void;
  /** Drills one level deeper into a nested list field within the current item. */
  pushSegment: (segment: DrillSegment) => void;
  /** Goes up exactly one level (or closes entirely from depth 1), via browser history. */
  popOne: () => void;
  /** Clears the "just created, focus the first field" flag once it's been applied. */
  clearAutoFocus: () => void;
}

const ListDrillContext = createContext<ListDrillContextValue | null>(null);

const HISTORY_MARKER = "__listDrill";

export function ListDrillProvider({ children }: { children: ReactNode }) {
  const [drill, setDrill] = useState<ListDrillState | null>(null);

  const enterList = useCallback((stepId: string, segment: DrillSegment) => {
    setDrill({ stepId, segments: [segment] });
    window.history.pushState({ [HISTORY_MARKER]: true }, "");
  }, []);

  const pushSegment = useCallback((segment: DrillSegment) => {
    setDrill((prev) => (prev ? { ...prev, segments: [...prev.segments, segment] } : prev));
    window.history.pushState({ [HISTORY_MARKER]: true }, "");
  }, []);

  const popOne = useCallback(() => {
    window.history.back();
  }, []);

  const clearAutoFocus = useCallback(() => {
    setDrill((prev) => {
      if (!prev || prev.segments.length === 0) {
        return prev;
      }
      const last = prev.segments[prev.segments.length - 1];
      if (!last.autoFocusFirstField) {
        return prev;
      }
      const segments = [...prev.segments];
      segments[segments.length - 1] = { ...last, autoFocusFirstField: false };
      return { ...prev, segments };
    });
  }, []);

  // Popstate is the single source of truth for popping a level (see file
  // header) — both hardware back and our own UI-triggered `history.back()`
  // land here. Only attached while a drill is active.
  useEffect(() => {
    if (!drill) {
      return undefined;
    }
    const handlePopState = () => {
      setDrill((prev) => {
        if (!prev) {
          return prev;
        }
        if (prev.segments.length <= 1) {
          return null;
        }
        return { ...prev, segments: prev.segments.slice(0, -1) };
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [drill]);

  const value = useMemo<ListDrillContextValue>(
    () => ({ drill, enterList, pushSegment, popOne, clearAutoFocus }),
    [drill, enterList, pushSegment, popOne, clearAutoFocus]
  );

  return <ListDrillContext.Provider value={value}>{children}</ListDrillContext.Provider>;
}

export function useListDrill(): ListDrillContextValue {
  const ctx = useContext(ListDrillContext);
  if (!ctx) {
    throw new Error("useListDrill must be used within a ListDrillProvider");
  }
  return ctx;
}
