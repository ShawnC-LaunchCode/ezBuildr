import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { blockAPI, type ApiBlock } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

export function useBlocks(workflowId: string | undefined, phase?: string): UseQueryResult<ApiBlock[]> {
    return useQuery({
        queryKey: queryKeys.blocks(workflowId ?? "", phase),
        queryFn: () => blockAPI.list(workflowId ?? "", phase as any),
        enabled: !!workflowId && workflowId !== "undefined",
    });
}

export function useCreateBlock(): UseMutationResult<ApiBlock, unknown, Omit<ApiBlock, "id" | "createdAt" | "updatedAt"> & { workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, ...data }: Omit<ApiBlock, "id" | "createdAt" | "updatedAt"> & { workflowId: string }) => {
            if (workflowId === "undefined") { throw new Error("Invalid workflow ID"); }
            return blockAPI.create(workflowId, data);
        },
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.blocks(variables.workflowId) });
        },
    });
}

export function useUpdateBlock(): UseMutationResult<ApiBlock, unknown, Partial<ApiBlock> & { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, workflowId, ...data }: Partial<ApiBlock> & { id: string; workflowId: string }) => {
            if (workflowId === "undefined") { throw new Error("Invalid workflow ID"); }
            return blockAPI.update(id, data);
        },
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.blocks(variables.workflowId) });
        },
    });
}

export function useReorderBlocks(): UseMutationResult<unknown, unknown, { workflowId: string; blocks: Array<{ id: string; order: number }> }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ workflowId, blocks }: { workflowId: string; blocks: Array<{ id: string; order: number }> }) =>
            blockAPI.reorder(workflowId, blocks),
        onMutate: async (variables) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: ["blocks", variables.workflowId] });
            // Snapshot the previous value
            const previousBlocks = queryClient.getQueryData<ApiBlock[]>(queryKeys.blocks(variables.workflowId));
            // Optimistically update to the new value
            if (previousBlocks) {
                const updatedBlocks = previousBlocks.map((block) => {
                    const newOrder = variables.blocks.find((b) => b.id === block.id);
                    return newOrder ? { ...block, order: newOrder.order } : block;
                });
                queryClient.setQueryData(queryKeys.blocks(variables.workflowId), updatedBlocks);
            }
            // Return context with the previous value
            return { previousBlocks };
        },
        onError: (err, variables, context) => {
            // Rollback to previous value on error
            if (context?.previousBlocks) {
                queryClient.setQueryData(queryKeys.blocks(variables.workflowId), context.previousBlocks);
            }
        },
        onSettled: async (_, __, variables) => {
            // Always refetch after error or success to ensure sync with server
            await queryClient.invalidateQueries({ queryKey: ["blocks", variables.workflowId] });
        },
    });
}

export function useDeleteBlock(): UseMutationResult<{ success: boolean }, unknown, { id: string; workflowId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (variables: { id: string; workflowId: string }) =>
            blockAPI.delete(variables.id),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.blocks(variables.workflowId) });
        },
    });
}
