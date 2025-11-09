/**
 * Zustand store for Dev Window panel state
 * Manages collapsed/expanded state, active tab, and pinned variables per workflow
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DevPanelTab = "variables" | "console" | "datamap";

interface DevPanelState {
  // Panel visibility per workflow
  isOpen: Record<string, boolean>;
  setIsOpen: (workflowId: string, isOpen: boolean) => void;
  togglePanel: (workflowId: string) => void;

  // Active tab per workflow
  activeTab: Record<string, DevPanelTab>;
  setActiveTab: (workflowId: string, tab: DevPanelTab) => void;

  // Pinned variables per workflow
  pinnedVariables: Record<string, string[]>;
  togglePin: (workflowId: string, variableKey: string) => void;
  isPinned: (workflowId: string, variableKey: string) => boolean;
}

export const useDevPanel = create<DevPanelState>()(
  persist(
    (set, get) => ({
      // Panel visibility
      isOpen: {},
      setIsOpen: (workflowId, isOpen) =>
        set((state) => ({
          isOpen: { ...state.isOpen, [workflowId]: isOpen },
        })),
      togglePanel: (workflowId) =>
        set((state) => ({
          isOpen: { ...state.isOpen, [workflowId]: !state.isOpen[workflowId] },
        })),

      // Active tab
      activeTab: {},
      setActiveTab: (workflowId, tab) =>
        set((state) => ({
          activeTab: { ...state.activeTab, [workflowId]: tab },
        })),

      // Pinned variables
      pinnedVariables: {},
      togglePin: (workflowId, variableKey) =>
        set((state) => {
          const current = state.pinnedVariables[workflowId] || [];
          const isPinned = current.includes(variableKey);
          return {
            pinnedVariables: {
              ...state.pinnedVariables,
              [workflowId]: isPinned
                ? current.filter((k) => k !== variableKey)
                : [...current, variableKey],
            },
          };
        }),
      isPinned: (workflowId, variableKey) => {
        const state = get();
        return (state.pinnedVariables[workflowId] || []).includes(variableKey);
      },
    }),
    {
      name: "devpanel-storage",
    }
  )
);
