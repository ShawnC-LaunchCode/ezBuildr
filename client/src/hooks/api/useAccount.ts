import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { accountAPI, workflowModeAPI, type ApiWorkflow, type WorkflowModeResponse, type AccountPreferences } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useAccountPreferences(): UseQueryResult<AccountPreferences> {
    return useQuery({
        queryKey: queryKeys.accountPreferences,
        queryFn: () => accountAPI.getPreferences(),
    });
}

export function useUpdateAccountPreferences(): UseMutationResult<AccountPreferences, unknown, AccountPreferences> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: accountAPI.updatePreferences,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.accountPreferences });
            // Invalidate all workflow modes since the default has changed
            await queryClient.invalidateQueries({ queryKey: ["workflows"] });
        },
    });
}

export function useWorkflowMode(workflowId: string | undefined): UseQueryResult<WorkflowModeResponse> {
    return useQuery({
        queryKey: queryKeys.workflowMode(workflowId ?? ""),
        queryFn: () => workflowModeAPI.getMode(workflowId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined",
    });
}

export function useSetWorkflowMode(): UseMutationResult<ApiWorkflow, unknown, { workflowId: string; modeOverride: 'easy' | 'advanced' | null }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, modeOverride }: { workflowId: string; modeOverride: 'easy' | 'advanced' | null }) =>
            workflowModeAPI.setMode(workflowId, modeOverride),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflowMode(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflow(variables.workflowId) });
        },
    });
}
