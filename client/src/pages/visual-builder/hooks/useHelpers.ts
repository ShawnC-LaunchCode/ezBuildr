/**
 * Hook to fetch available helper functions
 */

import { useQuery } from '@tanstack/react-query';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export interface HelperFunction {
  name: string;
  signature: string;
  doc?: string;
}

export interface HelpersResponse {
  helpers: HelperFunction[];
}

/**
 * Fetch list of available helper functions
 */
export function useHelpers() {
  return useQuery<HelpersResponse>({
    queryKey: ['helpers'],
    queryFn: () => fetchAPI<HelpersResponse>('/api/engine/helpers'),
    staleTime: Infinity, // Helpers don't change, cache forever
  });
}
