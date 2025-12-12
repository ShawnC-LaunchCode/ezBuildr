import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Custom API Error class to carry status and details
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const contentType = res.headers.get("content-type");
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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: data ? { "Content-Type": "application/json" } : {},
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
      if (error instanceof ApiError) {
        if (!isRetryableError(error, error.status)) {
          throw error; // Fail fast for 400, 401, 403, 429 (bubble up 429)
        }
      }

      // Network errors (TypeError) are retryable

      // If we have retries left, continue to retry logic
      if (attempt < maxRetries) {
        // Verify retryability again
        const status = (error instanceof ApiError) ? error.status : undefined;
        if (isRetryableError(error, status) || (error instanceof TypeError)) {
          lastError = error as Error;
          const delay = getRetryDelay(attempt);
          console.log(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`, error);
          await sleep(delay);
          continue;
        }
      }

      throw error;
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError || new Error('Request failed after retries');
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const res = await fetch(queryKey.join("/") as string, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
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
