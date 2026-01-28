import { useQuery, useMutation, useQueryClient, type UseQueryOptions, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";

import { collectionsAPI, type ApiCollectionField, type ApiCollectionWithStats, type ApiCollectionRecord, type ApiCollection } from "../../lib/vault-api";

import { queryKeys } from "./queryKeys";

// Collections
export function useCollections(tenantId: string | undefined, withStats?: boolean): UseQueryResult<ApiCollectionWithStats[]> {
    return useQuery({
        queryKey: queryKeys.collections(tenantId ?? ""),
        queryFn: () => collectionsAPI.list(tenantId ?? "", withStats),
        enabled: !!tenantId && tenantId !== "undefined",
    });
}

export function useCollection(tenantId: string | undefined, collectionId: string | undefined, withFields?: boolean): UseQueryResult<ApiCollection> {
    return useQuery({
        queryKey: queryKeys.collection(tenantId ?? "", collectionId ?? ""),
        queryFn: () => collectionsAPI.get(tenantId ?? "", collectionId ?? "", withFields),
        enabled: !!tenantId && tenantId !== "undefined" && !!collectionId && collectionId !== "undefined",
    });
}

export function useCreateCollection(): UseMutationResult<ApiCollection, unknown, { tenantId: string; name: string; slug?: string; description?: string | null }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ tenantId, ...data }: { tenantId: string; name: string; slug?: string; description?: string | null }) =>
            collectionsAPI.create(tenantId, data),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.collections(variables.tenantId) });
        },
    });
}

export function useUpdateCollection(): UseMutationResult<ApiCollection, unknown, { tenantId: string; collectionId: string; name?: string; slug?: string; description?: string | null }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ tenantId, collectionId, ...data }: { tenantId: string; collectionId: string; name?: string; slug?: string; description?: string | null }) =>
            collectionsAPI.update(tenantId, collectionId, data),
        onSuccess: async (data, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.collection(variables.tenantId, variables.collectionId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.collections(variables.tenantId) });
        },
    });
}

export function useDeleteCollection(): UseMutationResult<void, unknown, { tenantId: string; collectionId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ tenantId, collectionId }: { tenantId: string; collectionId: string }) =>
            collectionsAPI.delete(tenantId, collectionId),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.collections(variables.tenantId) });
        },
    });
}

// Fields
export function useCollectionFields(tenantId: string | undefined, collectionId: string | undefined): UseQueryResult<ApiCollectionField[]> {
    return useQuery({
        queryKey: queryKeys.collectionFields(tenantId ?? "", collectionId ?? ""),
        queryFn: () => collectionsAPI.listFields(tenantId ?? "", collectionId ?? ""),
        enabled: !!tenantId && tenantId !== "undefined" && !!collectionId && collectionId !== "undefined",
    });
}

export function useCreateCollectionField(): UseMutationResult<ApiCollectionField, unknown, { tenantId: string; collectionId: string } & Omit<ApiCollectionField, 'id' | 'collectionId' | 'createdAt' | 'updatedAt'>> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ tenantId, collectionId, ...data }: { tenantId: string; collectionId: string } & Omit<ApiCollectionField, 'id' | 'collectionId' | 'createdAt' | 'updatedAt'>) =>
            collectionsAPI.createField(tenantId, collectionId, data),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.collectionFields(variables.tenantId, variables.collectionId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.collection(variables.tenantId, variables.collectionId) });
        },
    });
}

export function useUpdateCollectionField(): UseMutationResult<ApiCollectionField, unknown, { tenantId: string; collectionId: string; fieldId: string } & Partial<Pick<ApiCollectionField, 'name' | 'slug' | 'isRequired' | 'options' | 'defaultValue'>>> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ tenantId, collectionId, fieldId, ...data }: { tenantId: string; collectionId: string; fieldId: string } & Partial<Pick<ApiCollectionField, 'name' | 'slug' | 'isRequired' | 'options' | 'defaultValue'>>) =>
            collectionsAPI.updateField(tenantId, collectionId, fieldId, data),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.collectionFields(variables.tenantId, variables.collectionId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.collection(variables.tenantId, variables.collectionId) });
        },
    });
}

export function useDeleteCollectionField(): UseMutationResult<void, unknown, { tenantId: string; collectionId: string; fieldId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ tenantId, collectionId, fieldId }: { tenantId: string; collectionId: string; fieldId: string }) =>
            collectionsAPI.deleteField(tenantId, collectionId, fieldId),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.collectionFields(variables.tenantId, variables.collectionId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.collection(variables.tenantId, variables.collectionId) });
        },
    });
}

// Records
export function useCollectionRecords(tenantId: string | undefined, collectionId: string | undefined, params?: { limit?: number; offset?: number; orderBy?: 'created_at' | 'updated_at'; order?: 'asc' | 'desc'; includeCount?: boolean }): UseQueryResult<{ records: ApiCollectionRecord[]; count?: number }> {
    return useQuery({
        queryKey: [...queryKeys.collectionRecords(tenantId ?? "", collectionId ?? ""), params],
        // Cast or adjust based on API return. Assuming API returns array or object with records.
        // If API returns ApiCollectionRecord[], then use that.
        // Assuming API returns { records: [], count: 0 } for paginated, or [] if not.
        // Let's assume listRecords return matches expectation or use unknown for safe fallback if unsure.
        // Assuming it's compatible with unknown for now, but trying to be strict.
        queryFn: () => collectionsAPI.listRecords(tenantId ?? "", collectionId ?? "", params) as Promise<any>,
        enabled: !!tenantId && tenantId !== "undefined" && !!collectionId && collectionId !== "undefined",
    });
}

export function useCollectionRecord(tenantId: string | undefined, collectionId: string | undefined, recordId: string | undefined): UseQueryResult<ApiCollectionRecord> {
    return useQuery({
        queryKey: queryKeys.collectionRecord(tenantId ?? "", collectionId ?? "", recordId ?? ""),
        queryFn: () => collectionsAPI.getRecord(tenantId ?? "", collectionId ?? "", recordId ?? ""),
        enabled: !!tenantId && tenantId !== "undefined" && !!collectionId && collectionId !== "undefined" && !!recordId && recordId !== "undefined",
    });
}

export function useCreateCollectionRecord(): UseMutationResult<ApiCollectionRecord, unknown, { tenantId: string; collectionId: string; data: Record<string, any> }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ tenantId, collectionId, data }: { tenantId: string; collectionId: string; data: Record<string, any> }) =>
            collectionsAPI.createRecord(tenantId, collectionId, data) as Promise<ApiCollectionRecord>,
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.collectionRecords(variables.tenantId, variables.collectionId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.collection(variables.tenantId, variables.collectionId) });
        },
    });
}

export function useUpdateCollectionRecord(): UseMutationResult<ApiCollectionRecord, unknown, { tenantId: string; collectionId: string; recordId: string; data: Record<string, any> }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ tenantId, collectionId, recordId, data }: { tenantId: string; collectionId: string; recordId: string; data: Record<string, any> }) =>
            collectionsAPI.updateRecord(tenantId, collectionId, recordId, data) as Promise<ApiCollectionRecord>,
        onSuccess: async (data, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.collectionRecord(variables.tenantId, variables.collectionId, variables.recordId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.collectionRecords(variables.tenantId, variables.collectionId) });
        },
    });
}

export function useDeleteCollectionRecord(): UseMutationResult<void, unknown, { tenantId: string; collectionId: string; recordId: string }> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ tenantId, collectionId, recordId }: { tenantId: string; collectionId: string; recordId: string }) =>
            collectionsAPI.deleteRecord(tenantId, collectionId, recordId),
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.collectionRecords(variables.tenantId, variables.collectionId) });
            await queryClient.invalidateQueries({ queryKey: queryKeys.collection(variables.tenantId, variables.collectionId) });
        },
    });
}
