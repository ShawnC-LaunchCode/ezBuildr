/**
 * Preview Store - Manages run tokens for preview mode
 * Stores bearer tokens for runs created in preview mode
 * Persists to localStorage to survive page refreshes
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredPreviewToken {
  token: string;
  expiresAt: number;
}

interface PreviewState {
  // Map of runId -> runToken (legacy string) or StoredPreviewToken
  tokens: Record<string, string | StoredPreviewToken>;

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
        set((state) => {
          const newTokens = { ...state.tokens, [runId]: { token, expiresAt: Date.now() + TTL_MS } };
          const keys = Object.keys(newTokens);
          // Keep only the 20 most recent tokens to prevent unbounded growth
          if (keys.length > 20) {
            const keysToRemove = keys.slice(0, keys.length - 20);
            keysToRemove.forEach(k => {

              delete newTokens[k];
            });
          }
          return { tokens: newTokens };
        }),

      getToken: (runId: string) => {
        const stored = get().tokens[runId];
        if (stored === undefined) {
          return undefined;
        }
        
        if (typeof stored === 'string') {
          return stored; // legacy format
        }
        
        if (Date.now() > stored.expiresAt) {
          get().clearToken(runId);
          return undefined;
        }
        
        return stored.token;
      },

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

/**
 * Purge expired preview tokens from the persisted store.
 * Call once on app startup so expired entries don't linger until individually read.
 * Legacy string-format tokens (no expiry info) are retained.
 */
export function cleanupStalePreviewTokens(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const { tokens } = usePreviewStore.getState();
  const now = Date.now();
  const cleaned: Record<string, string | StoredPreviewToken> = {};

  for (const [runId, stored] of Object.entries(tokens)) {
    // Retain legacy string tokens (no expiry info) and structured tokens not yet expired.
    const keep = typeof stored === 'string' || now <= stored.expiresAt;
    if (keep) {
      cleaned[runId] = stored;
    }
  }

  usePreviewStore.setState({ tokens: cleaned });
}
