import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { DevPanelBus } from "../../lib/devpanelBus";
import { UI_LABELS } from "../../lib/labels";
import { pageAPI, type ApiPage, type ApiReorderSkipRuleWarning } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function usePages(workflowId: string | undefined, options?: Omit<UseQueryOptions<ApiPage[]>, "queryKey" | "queryFn">): UseQueryResult<ApiPage[]> {
    return useQuery({
        queryKey: queryKeys.pages(workflowId ?? ""),
        queryFn: () => pageAPI.list(workflowId ?? ""),
        enabled: options?.enabled !== undefined ? options.enabled : !!workflowId && workflowId !== "undefined",
        ...options,
    });
}

export function useCreatePage(): UseMutationResult<ApiPage, unknown, { workflowId: string; title: string; description?: string; order: number; config?: unknown }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, ...data }: { workflowId: string; title: string; description?: string; order: number; config?: unknown }) =>
            pageAPI.create(workflowId, data),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.pages(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

/**
 * Append a new page at the end of a workflow (ICW-20).
 *
 * Single source of truth for the "add a page at the end" action shared by the
 * builder canvas and the sidebar tree — it derives the next order as
 * max(existing order) + 1 and standardizes the default title (no trailing space).
 * Pass overrides to reuse the ordering for a specialized page (e.g. the
 * Final Documents page keeps its own title + config).
 */
export function useCreatePageAtEnd(workflowId: string): {
    createPageAtEnd: (overrides?: { title?: string; config?: unknown }) => Promise<ApiPage>;
    isPending: boolean;
} {
    const { data: pages } = usePages(workflowId);
    const createPage = useCreatePage();

    const createPageAtEnd = (overrides?: { title?: string; config?: unknown }): Promise<ApiPage> => {
        // Append after the highest existing order (mirror the server's max+1
        // rule). Using `pages.length` was 0-based and collided with the
        // auto-scaffolded default "Page 1" (both order 1), tying page
        // order and breaking runner navigation — nextPage resolved back to
        // the current one (ICW2-B4). The human page label stays count-based.
        const existing = pages ?? [];
        const nextOrder = existing.length > 0
            ? Math.max(...existing.map((s) => s.order)) + 1
            : 1;
        return createPage.mutateAsync({
            workflowId,
            title: overrides?.title ?? `${UI_LABELS.PAGE} ${existing.length + 1}`,
            order: nextOrder,
            ...(overrides?.config !== undefined ? { config: overrides.config } : {}),
        });
    };

    return { createPageAtEnd, isPending: createPage.isPending };
}

export function useUpdatePage(): UseMutationResult<ApiPage, unknown, Partial<ApiPage> & { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        meta: { errorMessage: "Failed to save page. Change has been reverted." },
        mutationFn: ({ id, workflowId: _workflowId, ...data }: Partial<ApiPage> & { id: string; workflowId: string }) =>
            pageAPI.update(id, data),
        onMutate: async (variables) => {
            const { id, workflowId, ...data } = variables;
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.pages(workflowId) });
            // Snapshot the previous value
            const previousPages = queryClient.getQueryData<ApiPage[]>(queryKeys.pages(workflowId));
            // Optimistically update to the new value
            if (previousPages) {
                const updatedPages = previousPages.map((page) =>
                    page.id === id ? { ...page, ...data } : page
                );
                queryClient.setQueryData(queryKeys.pages(workflowId), updatedPages);
            }
            // Return context with the previous value
            return { previousPages };
        },
        onError: (err, variables, context) => {
            // Rollback to previous value on error
            if (context?.previousPages) {
                queryClient.setQueryData(queryKeys.pages(variables.workflowId), context.previousPages);
            }
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        onSettled: async (_, __, variables) => {
            // Always refetch after error or success to ensure sync with server
            await queryClient.invalidateQueries({ queryKey: queryKeys.pages(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

export function useReorderPages(): UseMutationResult<
    { message: string; affectedSkipRules: ApiReorderSkipRuleWarning[] },
    unknown,
    {
        workflowId: string;
        pages: Array<{ id: string; order: number; sectionId: string | null }>;
        deleteEmptySectionIds?: string[];
    }
> {
    const queryClient = useQueryClient();
    return useMutation({
        meta: { errorMessage: "Failed to reorder pages. The order has been reverted." },
        mutationFn: ({ workflowId, pages, deleteEmptySectionIds }) =>
            pageAPI.reorder(workflowId, pages, deleteEmptySectionIds ?? []),
        onMutate: async (variables) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: queryKeys.pages(variables.workflowId) });
            // Snapshot the previous value
            const previousPages = queryClient.getQueryData<ApiPage[]>(queryKeys.pages(variables.workflowId));
            // Optimistically update to the new value
            if (previousPages) {
                const updatedPages = previousPages
                    .map((page) => {
                        const newOrder = variables.pages.find((s) => s.id === page.id);
                        return newOrder
                            ? { ...page, order: newOrder.order, sectionId: newOrder.sectionId }
                            : page;
                    })
                    .sort((a, b) => a.order - b.order); // Sort by order to match backend behavior
                queryClient.setQueryData(queryKeys.pages(variables.workflowId), updatedPages);
            }
            // Return context with the previous value
            return { previousPages };
        },
        onError: (err, variables, context) => {
            // Rollback to previous value on error
            if (context?.previousPages) {
                queryClient.setQueryData(queryKeys.pages(variables.workflowId), context.previousPages);
            }
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
        onSettled: async (_, __, variables) => {
            // Always refetch after error or success to ensure sync with server
            await queryClient.invalidateQueries({ queryKey: queryKeys.pages(variables.workflowId) });
            if ((variables.deleteEmptySectionIds?.length ?? 0) > 0) {
                await queryClient.invalidateQueries({ queryKey: queryKeys.sections(variables.workflowId) });
            }
        },
    });
}

export function useDeletePage(): UseMutationResult<void, unknown, { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (variables: { id: string; workflowId: string }) =>
            pageAPI.delete(variables.id),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.pages(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}

/**
 * Duplicate a page, its steps, and its page-scoped logic rules
 * (ICW2-B5). Invalidates the page list, the workflow-wide step list, and
 * the logic-rule list so the copy (and its rules) appear without a full
 * reload.
 */
export function useDuplicatePage(): UseMutationResult<ApiPage, unknown, { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (variables: { id: string; workflowId: string }) =>
            pageAPI.duplicate(variables.id),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.pages(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.workflowSteps(variables.workflowId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.logicRules(variables.workflowId) });
            DevPanelBus.emitWorkflowUpdate();
        },
    });
}
