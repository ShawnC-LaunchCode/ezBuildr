import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
    type UseQueryOptions,
    type UseQueryResult,
} from "@tanstack/react-query";

import { DevPanelBus } from "../../lib/devpanelBus";
import {
    sectionAPI,
    type ApiSection,
    type CreateSectionInput,
    type UpdateSectionInput,
} from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useSections(
    workflowId: string | undefined,
    options?: Omit<UseQueryOptions<ApiSection[]>, "queryKey" | "queryFn">,
): UseQueryResult<ApiSection[]> {
    return useQuery({
        queryKey: queryKeys.sections(workflowId ?? ""),
        queryFn: () => sectionAPI.list(workflowId ?? ""),
        enabled: options?.enabled !== undefined
            ? options.enabled
            : !!workflowId && workflowId !== "undefined",
        ...options,
    });
}

export function useCreateSection(): UseMutationResult<
    ApiSection,
    unknown,
    CreateSectionInput & { workflowId: string }
> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, ...data }) => sectionAPI.create(workflowId, data),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.pages(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useUpdateSection(): UseMutationResult<
    ApiSection,
    unknown,
    UpdateSectionInput & { id: string; workflowId: string }
> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, workflowId: _workflowId, ...data }) => sectionAPI.update(id, data),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useDeleteSection(): UseMutationResult<
    void,
    unknown,
    { id: string; workflowId: string }
> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }) => sectionAPI.delete(id),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.pages(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}
