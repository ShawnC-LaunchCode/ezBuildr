import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import { accountAPI, workflowModeAPI } from "../../lib/vault-api";
import { queryKeys } from "./queryKeys";

export function useAccountPreferences(): UseQueryResult<unknown> {
    return useQuery({
        queryKey: queryKeys.accountPreferences,
        queryFn: () => accountAPI.getPreferences(),
    });
}

export function useUpdateAccountPreferences(): UseMutationResult<unknown, unknown, any> {
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

export function useWorkflowMode(workflowId: string | undefined): UseQueryResult<unknown> {
    return useQuery({
        queryKey: queryKeys.workflowMode(workflowId ?? ""),
        queryFn: () => workflowModeAPI.getMode(workflowId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined",
    });
}

export function useSetWorkflowMode(): UseMutationResult<unknown, unknown, { workflowId: string; modeOverride: 'easy' | 'advanced' | null }> {
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
