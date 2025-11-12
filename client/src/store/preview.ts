/**
 * Preview Store - Manages run tokens for preview mode
 * Stores bearer tokens for runs created in preview mode
 * Persists to localStorage to survive page refreshes
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PreviewState {
  // Map of runId -> runToken
  tokens: Record<string, string>;

  // Store a token for a run
  setToken: (runId: string, token: string) => void;

  // Get a token for a run
  getToken: (runId: string) => string | undefined;

  // Clear a token
  clearToken: (runId: string) => void;

  // Clear all tokens
  clearAll: () => void;
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set, get) => ({
      tokens: {},

      setToken: (runId: string, token: string) =>
        set((state) => ({
          tokens: { ...state.tokens, [runId]: token },
        })),

      getToken: (runId: string) => get().tokens[runId],

      clearToken: (runId: string) =>
        set((state) => {
          const newTokens = { ...state.tokens };
          delete newTokens[runId];
          return { tokens: newTokens };
        }),

      clearAll: () => set({ tokens: {} }),
    }),
    {
      name: "vaultlogic-preview-tokens",
    }
  )
);
