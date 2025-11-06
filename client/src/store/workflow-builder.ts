/**
 * Zustand store for Workflow Builder UI state
 */

import { create } from "zustand";

export type BuilderMode = "easy" | "advanced";
export type EntityType = "workflow" | "section" | "step" | "block";

interface Selection {
  type: EntityType;
  id: string;
}

interface WorkflowBuilderState {
  // UI Mode
  mode: BuilderMode;
  setMode: (mode: BuilderMode) => void;

  // Selection
  selection: Selection | null;
  selectWorkflow: (id: string) => void;
  selectSection: (id: string) => void;
  selectStep: (id: string) => void;
  selectBlock: (id: string) => void;
  clearSelection: () => void;

  // Preview
  previewRunId: string | null;
  isPreviewOpen: boolean;
  startPreview: (runId: string) => void;
  stopPreview: () => void;

  // Inspector Tab
  inspectorTab: "properties" | "blocks" | "logic";
  setInspectorTab: (tab: "properties" | "blocks" | "logic") => void;
}

export const useWorkflowBuilder = create<WorkflowBuilderState>((set) => ({
  // Mode
  mode: "easy",
  setMode: (mode) => set({ mode }),

  // Selection
  selection: null,
  selectWorkflow: (id) => set({ selection: { type: "workflow", id } }),
  selectSection: (id) => set({ selection: { type: "section", id } }),
  selectStep: (id) => set({ selection: { type: "step", id } }),
  selectBlock: (id) => set({ selection: { type: "block", id } }),
  clearSelection: () => set({ selection: null }),

  // Preview
  previewRunId: null,
  isPreviewOpen: false,
  startPreview: (runId) => set({ previewRunId: runId, isPreviewOpen: true }),
  stopPreview: () => set({ previewRunId: null, isPreviewOpen: false }),

  // Inspector Tab
  inspectorTab: "properties",
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
}));
