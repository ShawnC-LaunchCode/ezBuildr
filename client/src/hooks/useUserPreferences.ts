import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getQueryFn } from "@/lib/queryClient";
import { fetchAPI } from "@/lib/vault-api";

export interface UserPreferences {
  celebrationEffects?: boolean;
  darkMode?: "system" | "light" | "dark";
  aiHints?: boolean;
}

/**
 * Hook for managing user preferences
 * Provides access to user personalization settings with automatic syncing
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useUserPreferences() {
  const queryClient = useQueryClient();

  // Fetch user preferences
  const { data: prefs, isLoading } = useQuery<UserPreferences>({
    queryKey: ["preferences"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Update preferences mutation with optimistic updates
  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<UserPreferences>) => {
      return fetchAPI<UserPreferences>("/api/preferences", {
        method: "PUT",
        body: JSON.stringify(updates),
      });
    },
    onMutate: async (updates) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["preferences"] });

      // Snapshot the previous value
      const previousPrefs = queryClient.getQueryData<UserPreferences>(["preferences"]);

      // Optimistically update to the new value
      if (previousPrefs) {
        queryClient.setQueryData<UserPreferences>(["preferences"], {
          ...previousPrefs,
          ...updates,
        });
      }

      // Return context with the previous value
      return { previousPrefs };
    },
    onError: (err, updates, context) => {
      // Rollback to previous value on error
      if (context?.previousPrefs) {
        queryClient.setQueryData(["preferences"], context.previousPrefs);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure sync with server
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
  });

  // Reset preferences mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      return fetchAPI<UserPreferences>("/api/preferences/reset", {
        method: "POST",
      });
    },
    onSuccess: () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
  });

  const currentPrefs = prefs ?? {
    celebrationEffects: true,
    darkMode: "system" as const,
    aiHints: true,
  };

  // Apply dark mode class to HTML element
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const applyTheme = (mode: "system" | "light" | "dark") => {
      const root = document.documentElement;

      if (mode === "dark") {
        root.classList.add("dark");
      } else if (mode === "light") {
        root.classList.remove("dark");
      } else {
        // System mode - check OS preference
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDark) {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }
      }
    };

    applyTheme(currentPrefs.darkMode ?? "system");

    // Listen for system theme changes when in system mode
    if (currentPrefs.darkMode === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      const handleChange = (_e: MediaQueryListEvent) => {
        if (currentPrefs.darkMode === "system") {
          applyTheme("system");
        }
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [currentPrefs.darkMode]);

  return {
    prefs: currentPrefs,
    isLoading,
    update: updateMutation.mutate,
    updateAsync: updateMutation.mutateAsync,
    reset: resetMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
}
