import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import { dataSourceAPI } from "../../lib/vault-api";
import { queryKeys } from "./queryKeys";

export function useDataSources(): UseQueryResult<unknown[]> {
    return useQuery({
        queryKey: queryKeys.dataSources,
        queryFn: dataSourceAPI.list,
    });
}

export function useWorkflowDataSources(workflowId: string | undefined): UseQueryResult<unknown[]> {
    return useQuery({
        queryKey: queryKeys.workflowDataSources(workflowId ?? ""),
        queryFn: () => dataSourceAPI.listForWorkflow(workflowId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined",
    });
}

export function useLinkDataSource(): UseMutationResult<unknown, unknown, { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, workflowId }: { id: string; workflowId: string }) =>
            dataSourceAPI.linkToWorkflow(id, workflowId),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflowDataSources(variables.workflowId) });
        },
    });
}

export function useUnlinkDataSource(): UseMutationResult<unknown, unknown, { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, workflowId }: { id: string; workflowId: string }) =>
            dataSourceAPI.unlinkFromWorkflow(id, workflowId),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflowDataSources(variables.workflowId) });
        },
    });
}
