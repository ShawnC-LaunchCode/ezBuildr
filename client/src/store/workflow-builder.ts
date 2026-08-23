/**
 * Zustand store for Workflow Builder UI state.
 *
 * EPHEMERAL CLIENT STATE ONLY. Everything here answers "what am I looking at
 * right now" and is discarded on reload. Anything persisted server-side is
 * owned by its TanStack Query hook and must NOT be mirrored here.
 *
 * O-10: `mode` used to live here. It is persisted per workflow and served by
 * `useWorkflowMode(workflowId)`, but the store's copy was global and its
 * `setMode` had zero callers — so it sat at its `"easy"` default forever and
 * every component gating on it silently never showed its Advanced branch. A
 * global store also cannot represent a per-workflow setting, so it was deleted
 * rather than synced: a mirror could only ever have been accidentally right.
 *
 * O-11: the preview fields went the same way. `startPreview` had no callers, so
 * `isPreviewOpen` was always false, so PagesTab's inline preview pane never
 * rendered, so `RunnerPreview` never mounted and its `stopPreview` never fired
 * — a whole cluster kept alive only by references between its own dead parts.
 * `PreviewRunner` (rendered from WorkflowBuilder) is the live preview, so the
 * superseded cluster was deleted. `selectWorkflow`/`clearSelection` went too:
 * nothing ever called them, and `EntityType`'s "workflow" case existed only for
 * the former.
 */

import { create } from "zustand";

export type EntityType = "workflow" | "page" | "step" | "block";
export type InspectorTab = "properties" | "blocks" | "logic" | "transform";

interface Selection {
  type: EntityType;
  id: string;
}

interface WorkflowBuilderState {
  // Selection
  selection: Selection | null;
  selectPage: (id: string) => void;
  selectStep: (id: string) => void;
  selectBlock: (id: string) => void;

  // Inspector Tab
  inspectorTab: InspectorTab;
  setInspectorTab: (tab: InspectorTab) => void;
}

export const useWorkflowBuilder = create<WorkflowBuilderState>((set) => ({
  // Selection
  selection: null,
  selectPage: (id) => set({ selection: { type: "page", id } }),
  selectStep: (id) => set({ selection: { type: "step", id } }),
  selectBlock: (id) => set({ selection: { type: "block", id } }),

  // Inspector Tab
  inspectorTab: "properties",
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
}));
