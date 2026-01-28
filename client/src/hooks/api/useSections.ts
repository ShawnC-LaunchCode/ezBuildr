import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { DevPanelBus } from "../../lib/devpanelBus";
import { sectionAPI, type ApiSection } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useSections(workflowId: string | undefined, options?: Omit<UseQueryOptions<ApiSection[]>, "queryKey" | "queryFn">): UseQueryResult<ApiSection[]> {
    return useQuery({
        queryKey: queryKeys.sections(workflowId ?? ""),
        queryFn: () => sectionAPI.list(workflowId ?? ""),
        enabled: options?.enabled !== undefined ? options.enabled : !!workflowId && workflowId !== "undefined",
        ...options,
    });
}

export function useCreateSection(): UseMutationResult<ApiSection, unknown, { workflowId: string; title: string; description?: string; order: number; config?: unknown }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, ...data }: { workflowId: string; title: string; description?: string; order: number; config?: unknown }) =>
            sectionAPI.create(workflowId, data),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useUpdateSection(): UseMutationResult<ApiSection, unknown, Partial<ApiSection> & { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, workflowId: _workflowId, ...data }: Partial<ApiSection> & { id: string; workflowId: string }) =>
            sectionAPI.update(id, data),
        onMutate: async (variables) => {
            const { id, workflowId, ...data } = variables;
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.sections(workflowId) });
            // Snapshot the previous value
            const previousSections = queryClient.getQueryData<ApiSection[]>(queryKeys.sections(workflowId));
            // Optimistically update to the new value
            if (previousSections) {
                const updatedSections = previousSections.map((section) =>
                    section.id === id ? { ...section, ...data } : section
                );
                queryClient.setQueryData(queryKeys.sections(workflowId), updatedSections);
            }
            // Return context with the previous value
            return { previousSections };
        },
        onError: (err, variables, context) => {
            // Rollback to previous value on error
            if (context?.previousSections) {
                queryClient.setQueryData(queryKeys.sections(variables.workflowId), context.previousSections);
            }
        },
        onSettled: async (_, __, variables) => {
            // Always refetch after error or success to ensure sync with server
            await queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useReorderSections(): UseMutationResult<unknown, unknown, { workflowId: string; sections: Array<{ id: string; order: number }> }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, sections }: { workflowId: string; sections: Array<{ id: string; order: number }> }) =>
            sectionAPI.reorder(workflowId, sections),
        onMutate: async (variables) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.sections(variables.workflowId) });
            // Snapshot the previous value
            const previousSections = queryClient.getQueryData<ApiSection[]>(queryKeys.sections(variables.workflowId));
            // Optimistically update to the new value
            if (previousSections) {
                const updatedSections = previousSections
                    .map((section) => {
                        const newOrder = variables.sections.find((s) => s.id === section.id);
                        return newOrder ? { ...section, order: newOrder.order } : section;
                    })
                    .sort((a, b) => a.order - b.order); // Sort by order to match backend behavior
                queryClient.setQueryData(queryKeys.sections(variables.workflowId), updatedSections);
            }
            // Return context with the previous value
            return { previousSections };
        },
        onError: (err, variables, context) => {
            // Rollback to previous value on error
            if (context?.previousSections) {
                queryClient.setQueryData(queryKeys.sections(variables.workflowId), context.previousSections);
            }
        },
        onSettled: async (_, __, variables) => {
            // Always refetch after error or success to ensure sync with server
            await queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
        },
    });
}

export function useDeleteSection(): UseMutationResult<void, unknown, { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (variables: { id: string; workflowId: string }) =>
            sectionAPI.delete(variables.id),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}
