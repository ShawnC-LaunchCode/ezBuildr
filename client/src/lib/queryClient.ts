/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { QueryClient, QueryFunction, MutationCache } from "@tanstack/react-query";
import { toast } from "../hooks/use-toast";

// Custom API Error class to carry status and details
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = res.headers.get("content-type");
    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
    if (contentType && contentType.includes("application/json")) {
      const json = await res.json().catch(() => ({}));
      throw new ApiError(json.message || res.statusText, res.status, json.code, json.details);
    }
    const text = (await res.text()) || res.statusText;
    throw new ApiError(text, res.status);
  }
}

// ... existing isRetryableError, getRetryDelay, sleep ...

function isRetryableError(error: unknown, status?: number): boolean {
  // Network errors (fetch failed, timeout, etc.)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // 5xx server errors are retryable
  // eslint-disable-next-line sonarjs/prefer-single-boolean-return
  if (status && status >= 500) {
    return true;
  }

  // 429 Rate Limit is retryable locally via simple delay if we want,
  // but usually requires longer wait, so we might want to bubble it up
  // unless we want to retry here too. For now let's bubble 429 up
  // since we handled short-delay retries in the backend service layer.

  // 4xx client errors are NOT retryable
  return false;
}

// ...

/**
 * Calculate exponential backoff delay
 */
function getRetryDelay(retryCount: number): number {
  // Exponential backoff: 1s, 2s, 4s
  return Math.min(1000 * Math.pow(2, retryCount), 4000);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import { getAccessToken , fetchAPI } from "./vault-api";
// eslint-disable-next-line sonarjs/cognitive-complexity
export async function apiRequest(
  method: string,
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- optional already includes undefined
  data?: unknown | undefined,
): Promise<Response> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const headers: Record<string, string> = data ? { "Content-Type": "application/json" } : {};

      const token = getAccessToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
        credentials: "include",
      });

      // If response is not ok, throw ApiError or generic Error
      if (!res.ok) {
        await throwIfResNotOk(res);
      }

      return res;
    } catch (error) {
      // If it's an API error (from throwIfResNotOk), check if retryable (e.g. 500)
      if (error instanceof ApiError && !isRetryableError(error, error.status)) {
        throw error;
      }

      // Network errors (TypeError) are retryable

      // If we have retries left, continue to retry logic
      if (attempt < maxRetries) {
        // Verify retryability again
        const status = (error instanceof ApiError) ? error.status : undefined;
        if (isRetryableError(error, status) || (error instanceof TypeError)) {
          lastError = error as Error;
          // eslint-disable-next-line no-console
          const delay = getRetryDelay(attempt);
          // eslint-disable-next-line no-console
          console.log(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`, error);
          await sleep(delay);
          continue;
        }
      }

      throw error;
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError ?? new Error('Request failed after retries');
}



// Define behavior for 401 Unauthorized responses
export type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      try {
        const endpoint = queryKey.join("/");
        // Check if endpoint starts with /api (some keys might not)
        const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await fetchAPI<any>(path);
      } catch (error: unknown) {
        if (unauthorizedBehavior === "returnNull" && error instanceof Error && (error.message.includes('401') || error.message.includes('Unauthorized'))) {
          return null;
        }
        throw error;
      }
    };

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, variables, context, mutation) => {
      // Allow specific mutations to opt out of the global toast
      if (mutation.meta?.suppressGlobalError) {
        return;
      }

      const customMessage = mutation.meta?.errorMessage as string | undefined;

      toast({
        variant: "destructive",
        title: "Error",
        description: customMessage ?? "Change could not be saved — it has been reverted.",
      });
    },
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
