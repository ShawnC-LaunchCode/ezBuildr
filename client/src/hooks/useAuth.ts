import { clearAllRunTokens } from "@/lib/runTokens";
import { usePreviewStore } from "@/store/preview";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { refreshSession } from "@/lib/sessionRefresh";
import { authAPI, setAccessToken } from "@/lib/vault-api";

import type { AuthUserPayload } from "@shared/schema";

// Response type from refresh/login. `AuthUserPayload` is the exact projection
// both endpoints send (`server/routes/auth.routes.ts`'s `buildAuthUserPayload`) —
// not the full `User` row, which neither endpoint has ever actually returned
// (MAP-10).
interface AuthResponse {
  user: AuthUserPayload;
  token: string;
}

interface AuthHookReturn {
  user: AuthUserPayload | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  logout: () => Promise<void>;
}

export function useAuth(): AuthHookReturn {
  const queryClient = useQueryClient();

  const { data: authData, isLoading, error } = useQuery<AuthResponse | null>({
    queryKey: ["auth"],
    queryFn: async () => {
      try {
        // Silent refresh on mount/focus: exchanges the HttpOnly cookie for a JWT
        // access token. Shared with fetchAPI's 401 retry — two refreshes sent
        // with the same cookie sign the user out everywhere (sessionRefresh.ts).
        const refreshed = await refreshSession();

        if (!refreshed.ok) {
          if (refreshed.status === 401) {
            return null;
          }
          throw new Error("Failed to refresh session");
        }

        return refreshed.body as AuthResponse | null;
      } catch (_err) {
        return null;
      }
    },
    // Don't retry on 401
    retry: false,
    // Consider state fresh for 14 minutes (token lasts 15)
    staleTime: 1000 * 60 * 14,
    refetchOnWindowFocus: true, // Refetch on focus to ensure token is valid
  });

  // Sync token to API client whenever it changes
  useEffect(() => {
    if (authData?.token) {
      setAccessToken(authData.token);
    } else if (error !== null || authData === null) {
      setAccessToken(null);
    }
  }, [authData, error]);

  const logout = async (): Promise<void> => {
    await authAPI.logout();
    setAccessToken(null);
    // O-11: run tokens persist to localStorage and authenticate access to
    // their run, but nothing cleared them on logout — only expired ones were
    // swept, once, at app start. On a shared machine the next person inherited
    // any still-live token. They live in two independent stores, so both are
    // cleared here.
    usePreviewStore.getState().clearAll();
    clearAllRunTokens();
    queryClient.setQueryData(["auth"], null);
    window.location.href = "/auth/login";
  };

  return {
    user: authData?.user ?? null,
    token: authData?.token ?? null,
    isLoading,
    isAuthenticated: !!authData?.user,
    error,
    logout
  };
}
