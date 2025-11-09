/**
 * Enhanced useWorkflowVariables hook with real-time sync
 * Provides auto-refresh and event-driven invalidation for Dev Window
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkflowVariables, queryKeys } from "@/lib/vault-hooks";
import { DevPanelBus } from "@/lib/devpanelBus";

interface UseWorkflowVariablesLiveOptions {
  /**
   * Polling interval in milliseconds
   * @default 5000 (5 seconds)
   */
  refetchInterval?: number;
  /**
   * Whether to enable auto-refresh
   * @default true
   */
  enabled?: boolean;
}

/**
 * Hook that provides real-time synced workflow variables
 * Combines polling with event-driven updates for instant synchronization
 */
export function useWorkflowVariablesLive(
  workflowId: string | undefined,
  options: UseWorkflowVariablesLiveOptions = {}
) {
  const { refetchInterval = 5000, enabled = true } = options;
  const queryClient = useQueryClient();

  // Listen to workflow update events from the bus
  useEffect(() => {
    if (!workflowId || !enabled) return;

    const unsubscribe = DevPanelBus.onWorkflowUpdate(() => {
      // Invalidate immediately when workflow changes
      queryClient.invalidateQueries({ queryKey: queryKeys.variables(workflowId) });
    });

    return () => unsubscribe();
  }, [workflowId, enabled, queryClient]);

  // Since we can't modify the base hook, we'll use useQuery directly with refetchInterval
  // This is a wrapper that adds polling to the existing hook
  const query = useWorkflowVariables(workflowId);

  // Enable refetch interval for live updates
  useEffect(() => {
    if (!workflowId || !enabled) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.variables(workflowId) });
    }, refetchInterval);

    return () => clearInterval(interval);
  }, [workflowId, enabled, refetchInterval, queryClient]);

  return query;
}
