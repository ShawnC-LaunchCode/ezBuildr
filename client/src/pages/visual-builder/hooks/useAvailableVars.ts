/**
 * Hook to fetch available variables for a node in the workflow
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

export interface AvailableVarsResponse {
  vars: string[];
}

/**
 * Fetch available variables for a specific node
 */
export function useAvailableVars(workflowId: string | undefined, nodeId: string | undefined) {
  return useQuery<AvailableVarsResponse>({
    queryKey: ['availableVars', workflowId, nodeId],
    queryFn: () => fetchAPI<AvailableVarsResponse>(`/api/workflows/${workflowId}/availableVars/${nodeId}`),
    enabled: !!workflowId && !!nodeId,
    staleTime: 30000, // Cache for 30 seconds
  });
}
