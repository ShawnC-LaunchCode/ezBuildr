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
 */

import { create } from "zustand";

export type EntityType = "workflow" | "section" | "step" | "block";
export type InspectorTab = "properties" | "blocks" | "logic" | "transform";

interface Selection {
  type: EntityType;
  id: string;
}

interface WorkflowBuilderState {
  // Selection
  selection: Selection | null;
  selectWorkflow: (id: string) => void;
  selectSection: (id: string) => void;
  selectStep: (id: string) => void;
  selectBlock: (id: string) => void;
  clearSelection: () => void;

  // Inspector Tab
  inspectorTab: InspectorTab;
  setInspectorTab: (tab: InspectorTab) => void;

  // Preview
  previewRunId: string | null;
  isPreviewOpen: boolean;
  startPreview: (runId: string) => void;
  stopPreview: () => void;
}

export const useWorkflowBuilder = create<WorkflowBuilderState>((set) => ({
  // Selection
  selection: null,
  selectWorkflow: (id) => set({ selection: { type: "workflow", id } }),
  selectSection: (id) => set({ selection: { type: "section", id } }),
  selectStep: (id) => set({ selection: { type: "step", id } }),
  selectBlock: (id) => set({ selection: { type: "block", id } }),
  clearSelection: () => set({ selection: null }),

  // Inspector Tab
  inspectorTab: "properties",
  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  // Preview
  previewRunId: null,
  isPreviewOpen: false,
  startPreview: (runId) => set({ previewRunId: runId, isPreviewOpen: true }),
  stopPreview: () => set({ previewRunId: null, isPreviewOpen: false }),
}));
