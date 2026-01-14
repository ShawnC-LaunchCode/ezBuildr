import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { authAPI, setAccessToken } from "@/lib/vault-api";

import type { User } from "@shared/schema";

// Response type from refresh/login
interface AuthResponse {
  user: User;
  token: string;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: authData, isLoading, error } = useQuery<AuthResponse | null>({
    queryKey: ["auth"],
    queryFn: async () => {
      try {
        // Try to refresh token on mount (silent refresh)
        // This exchanges the HttpOnly cookie for a JWT Access Token
        const res = await fetch("/api/auth/refresh-token", {
          method: "POST",
          credentials: "include", // CRITICAL: Must include cookies for refresh token
        });

        if (!res.ok) {
          if (res.status === 401) {return null;}
          throw new Error("Failed to refresh session");
        }

        return await res.json(); // { user, token }
      } catch (err) {
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
    } else if (error || authData === null) {
      setAccessToken(null);
    }
  }, [authData, error]);

  const logout = async () => {
    await authAPI.logout();
    setAccessToken(null);
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
