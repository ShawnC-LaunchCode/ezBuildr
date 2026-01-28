import { useQuery, useQueries, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import { stepAPI, type ApiStep, type ApiSection } from "../../lib/vault-api";
import { DevPanelBus } from "../../lib/devpanelBus";
import { queryKeys } from "./queryKeys";

export function useSteps(sectionId: string | undefined, options?: Omit<UseQueryOptions<ApiStep[]>, "queryKey" | "queryFn">): UseQueryResult<ApiStep[]> {
    return useQuery({
        queryKey: queryKeys.steps(sectionId ?? ""),
        queryFn: () => stepAPI.list(sectionId ?? ""),
        enabled: !!sectionId && sectionId !== "undefined",
        ...options,
    });
}

/**
 * Fetch steps for multiple sections at once
 * Returns a Record<sectionId, ApiStep[]>
 *
 * This hook respects React's Rules of Hooks by using useQueries
 * which always calls the same number of hooks based on the sections array
 */
export function useAllSteps(sections: ApiSection[]): Record<string, ApiStep[]> {
    const queries = useQueries({
        queries: sections.map((section) => ({
            queryKey: queryKeys.steps(section.id),
            queryFn: () => stepAPI.list(section.id),
            staleTime: 5000, // Cache for 5 seconds to avoid excessive refetches
        })),
    });
    // Combine results into a Record<sectionId, steps[]>
    const allSteps: Record<string, ApiStep[]> = {};
    sections.forEach((section, index) => {
        allSteps[section.id] = queries[index].data || [];
    });
    return allSteps;
}

export function useStep(stepId: string | undefined): UseQueryResult<ApiStep> {
    return useQuery({
        queryKey: queryKeys.step(stepId ?? ""),
        queryFn: () => stepAPI.get(stepId ?? ""),
        enabled: !!stepId && stepId !== "undefined",
    });
}

export function useCreateStep(): UseMutationResult<ApiStep, unknown, Omit<ApiStep, "id" | "createdAt" | "updatedAt"> & { sectionId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ sectionId, ...data }: Omit<ApiStep, "id" | "createdAt" | "updatedAt"> & { sectionId: string }) =>
            stepAPI.create(sectionId, data),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useUpdateStep(): UseMutationResult<ApiStep, unknown, Partial<ApiStep> & { id: string; sectionId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, sectionId: _sectionId, ...data }: Partial<ApiStep> & { id: string; sectionId: string }) =>
            stepAPI.update(id, data),
        onMutate: async (variables) => {
            const { id, sectionId, ...data } = variables;
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.steps(sectionId) });
            await queryClient.cancelQueries({ queryKey: queryKeys.step(id) });
            // Snapshot the previous values
            const previousSteps = queryClient.getQueryData<ApiStep[]>(queryKeys.steps(sectionId));
            const previousStep = queryClient.getQueryData<ApiStep>(queryKeys.step(id));
            // Optimistically update the steps list
            if (previousSteps) {
                const updatedSteps = previousSteps.map((step) =>
                    step.id === id ? { ...step, ...data } : step
                );
                queryClient.setQueryData(queryKeys.steps(sectionId), updatedSteps);
            }
            // Optimistically update the single step
            if (previousStep) {
                queryClient.setQueryData(queryKeys.step(id), { ...previousStep, ...data });
            }
            // Return context with the previous values
            return { previousSteps, previousStep };
        },
        onError: (err, variables, context) => {
            // Rollback to previous values on error
            if (context?.previousSteps) {
                queryClient.setQueryData(queryKeys.steps(variables.sectionId), context.previousSteps);
            }
            if (context?.previousStep) {
                queryClient.setQueryData(queryKeys.step(variables.id), context.previousStep);
            }
        },
        onSettled: async (data, error, variables) => {
            // Always refetch after error or success to ensure sync with server
            await queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.step(variables.id) });
            // Invalidate variables when step alias changes
            // Invalidate everything to be safe
            await queryClient.invalidateQueries({ queryKey: ["workflows"] });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useReorderSteps(): UseMutationResult<unknown, unknown, { sectionId: string; steps: Array<{ id: string; order: number }> }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ sectionId, steps }: { sectionId: string; steps: Array<{ id: string; order: number }> }) =>
            stepAPI.reorder(sectionId, steps),
        onMutate: async (variables) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.steps(variables.sectionId) });
            // Snapshot the previous value
            const previousSteps = queryClient.getQueryData<ApiStep[]>(queryKeys.steps(variables.sectionId));
            // Optimistically update to the new value
            if (previousSteps) {
                const updatedSteps = previousSteps.map((step) => {
                    const newOrder = variables.steps.find((s) => s.id === step.id);
                    return newOrder ? { ...step, order: newOrder.order } : step;
                });
                queryClient.setQueryData(queryKeys.steps(variables.sectionId), updatedSteps);
            }
            // Return context with the previous value
            return { previousSteps };
        },
        onError: (err, variables, context) => {
            // Rollback to previous value on error
            if (context?.previousSteps) {
                queryClient.setQueryData(queryKeys.steps(variables.sectionId), context.previousSteps);
            }
        },
        onSettled: async (_, __, variables) => {
            // Always refetch after error or success to ensure sync with server
            await queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
        },
    });
}

export function useDeleteStep(): UseMutationResult<void, unknown, { id: string; sectionId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (variables: { id: string; sectionId: string }) =>
            stepAPI.delete(variables.id),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.sectionId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}
