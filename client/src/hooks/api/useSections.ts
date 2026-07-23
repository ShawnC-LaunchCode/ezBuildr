import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { DevPanelBus } from "../../lib/devpanelBus";
import { UI_LABELS } from "../../lib/labels";
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

/**
 * Append a new section at the end of a workflow (ICW-20).
 *
 * Single source of truth for the "add a page at the end" action shared by the
 * builder canvas and the sidebar tree — it derives the next order as
 * max(existing order) + 1 and standardizes the default title (no trailing space).
 * Pass overrides to reuse the ordering for a specialized section (e.g. the
 * Final Documents section keeps its own title + config).
 */
export function useCreateSectionAtEnd(workflowId: string): {
    createSectionAtEnd: (overrides?: { title?: string; config?: unknown }) => Promise<ApiSection>;
    isPending: boolean;
} {
    const { data: sections } = useSections(workflowId);
    const createSection = useCreateSection();

    const createSectionAtEnd = (overrides?: { title?: string; config?: unknown }): Promise<ApiSection> => {
        // Append after the highest existing order (mirror the server's max+1
        // rule). Using `sections.length` was 0-based and collided with the
        // auto-scaffolded default "Section 1" (both order 1), tying section
        // order and breaking runner navigation — nextSection resolved back to
        // the current one (ICW2-B4). The human page label stays count-based.
        const existing = sections ?? [];
        const nextOrder = existing.length > 0
            ? Math.max(...existing.map((s) => s.order)) + 1
            : 1;
        return createSection.mutateAsync({
            workflowId,
            title: overrides?.title ?? `${UI_LABELS.PAGE} ${existing.length + 1}`,
            order: nextOrder,
            ...(overrides?.config !== undefined ? { config: overrides.config } : {}),
        });
    };

    return { createSectionAtEnd, isPending: createSection.isPending };
}

export function useUpdateSection(): UseMutationResult<ApiSection, unknown, Partial<ApiSection> & { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        meta: { errorMessage: "Failed to save section. Change has been reverted." },
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
        // eslint-disable-next-line @typescript-eslint/naming-convention
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
        // eslint-disable-next-line @typescript-eslint/naming-convention
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

/**
 * Duplicate a section, its steps, and its section-scoped logic rules
 * (ICW2-B5). Invalidates the section list, the workflow-wide step list, and
 * the logic-rule list so the copy (and its rules) appear without a full
 * reload.
 */
export function useDuplicateSection(): UseMutationResult<ApiSection, unknown, { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (variables: { id: string; workflowId: string }) =>
            sectionAPI.duplicate(variables.id),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflowSteps(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.logicRules(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}
