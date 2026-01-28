import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import { versionAPI } from "../../lib/vault-api";
import { DevPanelBus } from "../../lib/devpanelBus";
import { queryKeys } from "./queryKeys";

export function useVersions(workflowId: string | undefined): UseQueryResult<unknown[]> { // api returns any[] usually? Need to check types
    // versionAPI.list returns Promise<any> usually unless typed. 
    // vault-api imports: type ApiProject, ApiWorkflow... does it have ApiVersion?
    // I will leave unknown[] or any[] for now and check if I can improve.
    return useQuery({
        queryKey: queryKeys.versions(workflowId ?? ""),
        queryFn: () => versionAPI.list(workflowId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined",
    });
}

export function usePublishWorkflow(): UseMutationResult<unknown, unknown, { workflowId: string; graphJson: unknown; notes?: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, graphJson, notes }: { workflowId: string; graphJson: unknown; notes?: string }) =>
            versionAPI.publish(workflowId, { graphJson, notes }),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.versions(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflow(variables.workflowId) });
        },
    });
}

export function useRestoreVersion(): UseMutationResult<unknown, unknown, { workflowId: string; versionId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, versionId }: { workflowId: string; versionId: string }) =>
            versionAPI.restore(workflowId, versionId),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.versions(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflow(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
            // Invalidate everything basically
            await queryClient.invalidateQueries({ queryKey: ["workflows", variables.workflowId] });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}
