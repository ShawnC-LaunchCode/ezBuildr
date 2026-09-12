import { useQuery, useQueries, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { DevPanelBus } from "../../lib/devpanelBus";
import { stepAPI, type ApiStep, type ApiPage } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useSteps(pageId: string | undefined, options?: Omit<UseQueryOptions<ApiStep[]>, "queryKey" | "queryFn">): UseQueryResult<ApiStep[]> {
    return useQuery({
        queryKey: queryKeys.steps(pageId ?? ""),
        queryFn: () => stepAPI.list(pageId ?? ""),
        enabled: !!pageId && pageId !== "undefined",
        ...options,
    });
}

export function useWorkflowSteps(workflowId: string | undefined, options?: Omit<UseQueryOptions<ApiStep[]>, "queryKey" | "queryFn">): UseQueryResult<ApiStep[]> {
    return useQuery({
        queryKey: queryKeys.workflowSteps(workflowId ?? ""),
        queryFn: () => stepAPI.listByWorkflow(workflowId ?? ""),
        enabled: !!workflowId && workflowId !== "undefined",
        ...options,
    });
}

/**
 * Fetch steps for multiple pages at once
 * Returns a Record<pageId, ApiStep[]>
 *
 * This hook respects React's Rules of Hooks by using useQueries
 * which always calls the same number of hooks based on the pages array
 */
export function useAllSteps(pages: ApiPage[]): Record<string, ApiStep[]> {
    const queries = useQueries({
        queries: pages.map((page) => ({
            queryKey: queryKeys.steps(page.id),
            queryFn: () => stepAPI.list(page.id),
            staleTime: 5000, // Cache for 5 seconds to avoid excessive refetches
        })),
    });
    // Combine results into a Record<pageId, steps[]>
    const allSteps: Record<string, ApiStep[]> = {};
    pages.forEach((page, index) => {
        allSteps[page.id] = queries[index].data ?? [];
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

export function useCreateStep(): UseMutationResult<ApiStep, unknown, Omit<ApiStep, "id" | "createdAt" | "updatedAt" | "workflowId"> & { pageId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ pageId, ...data }: Omit<ApiStep, "id" | "createdAt" | "updatedAt" | "workflowId"> & { pageId: string }) =>
            stepAPI.create(pageId, data),
        onSuccess: async (step, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.pageId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflowSteps(step.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useUpdateStep(): UseMutationResult<ApiStep, unknown, Partial<ApiStep> & { id: string; pageId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        meta: { errorMessage: "Failed to save step. Change has been reverted." },
        mutationFn: ({ id, pageId: _pageId, ...data }: Partial<ApiStep> & { id: string; pageId: string }) =>
            stepAPI.update(id, data),
        onMutate: async (variables) => {
            const { id, pageId, ...data } = variables;
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.steps(pageId) });
            await queryClient.cancelQueries({ queryKey: queryKeys.step(id) });
            // Snapshot the previous values
            const previousSteps = queryClient.getQueryData<ApiStep[]>(queryKeys.steps(pageId));
            const previousStep = queryClient.getQueryData<ApiStep>(queryKeys.step(id));
            // Optimistically update the steps list
            if (previousSteps) {
                const updatedSteps = previousSteps.map((step) =>
                    step.id === id ? { ...step, ...data } : step
                );
                queryClient.setQueryData(queryKeys.steps(pageId), updatedSteps);
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
                queryClient.setQueryData(queryKeys.steps(variables.pageId), context.previousSteps);
            }
            if (context?.previousStep) {
                queryClient.setQueryData(queryKeys.step(variables.id), context.previousStep);
            }
        },
        onSettled: async (data, error, variables) => {
            // Always refetch after error or success to ensure sync with server
            await queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.pageId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.step(variables.id) });
            // Invalidate variables when step alias changes
            // Invalidate everything to be safe
            if (data?.workflowId) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.workflowSteps(data.workflowId) });
            }
            await queryClient.invalidateQueries({ queryKey: ["workflows"] });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useReorderSteps(): UseMutationResult<unknown, unknown, { pageId: string; steps: Array<{ id: string; order: number }> }> {
    const queryClient = useQueryClient();
    return useMutation({
        meta: { errorMessage: "Failed to reorder questions. The order has been reverted." },
        mutationFn: ({ pageId, steps }: { pageId: string; steps: Array<{ id: string; order: number }> }) =>
            stepAPI.reorder(pageId, steps),
        onMutate: async (variables) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.steps(variables.pageId) });
            // Snapshot the previous value
            const previousSteps = queryClient.getQueryData<ApiStep[]>(queryKeys.steps(variables.pageId));
            // Optimistically update to the new value
            if (previousSteps) {
                const updatedSteps = previousSteps.map((step) => {
                    const newOrder = variables.steps.find((s) => s.id === step.id);
                    return newOrder ? { ...step, order: newOrder.order } : step;
                });
                queryClient.setQueryData(queryKeys.steps(variables.pageId), updatedSteps);
            }
            // Return context with the previous value
            return { previousSteps };
        },
        onError: (err, variables, context) => {
            // Rollback to previous value on error
            if (context?.previousSteps) {
                queryClient.setQueryData(queryKeys.steps(variables.pageId), context.previousSteps);
            }
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        onSettled: async (_, __, variables) => {
            // Always refetch after error or success to ensure sync with server
            await queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.pageId) });
            await queryClient.invalidateQueries({ queryKey: ["steps", "workflow"] });
        },
    });
}

export function useDeleteStep(): UseMutationResult<void, unknown, { id: string; pageId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (variables: { id: string; pageId: string }) =>
            stepAPI.delete(variables.id),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.pageId) });
            await queryClient.invalidateQueries({ queryKey: ["steps", "workflow"] });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

/**
 * Duplicate a single step into the same page (ICW2-B5). Invalidates the
 * page's step list (and the workflow-wide step list) so the copy appears
 * without a full reload.
 */
export function useDuplicateStep(): UseMutationResult<ApiStep, unknown, { id: string; pageId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (variables: { id: string; pageId: string }) =>
            stepAPI.duplicate(variables.id),
        onSuccess: async (step, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.steps(variables.pageId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflowSteps(step.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}
