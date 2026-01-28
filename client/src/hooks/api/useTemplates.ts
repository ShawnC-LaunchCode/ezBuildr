import { useQuery, useQueries, type UseQueryResult } from "@tanstack/react-query";
import { templateAPI } from "../../lib/vault-api";

export function useTemplates(): UseQueryResult<unknown[]> {
    return useQuery({
        queryKey: ["templates"],
        queryFn: templateAPI.list,
    });
}

export function useTemplatePlaceholders(templateId: string | undefined): UseQueryResult<any> {
    return useQuery({
        queryKey: ["templates", templateId, "placeholders"],
        queryFn: () => templateAPI.getPlaceholders(templateId ?? ""),
        enabled: !!templateId && templateId !== "undefined",
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    });
}

export function useActiveTemplateVariables(projectId: string | undefined, sectionConfig: any): { requiredVariables: string[]; isLoading: boolean; isError: boolean } {
    // Extract template IDs from config
    const templateIds: string[] = Array.isArray(sectionConfig?.templates)
        ? sectionConfig.templates
        : [];
    const queries = useQueries({
        queries: templateIds.map((id) => ({
            queryKey: ["templates", id, "placeholders"],
            queryFn: () => templateAPI.getPlaceholders(id),
            staleTime: 1000 * 60 * 5,
        })),
    });
    // Aggregate required variables
    const requiredVariables = new Set<string>();
    const isLoading = queries.some((q) => q.isLoading);
    const isError = queries.some((q) => q.isError);
    if (!isLoading && !isError) {
        queries.forEach((query) => {
            if (query.data?.placeholders) {
                query.data.placeholders.forEach((p: any) => {
                    if (p.type === 'variable' || p.type === 'text') { // Assuming 'text' is default from service
                        requiredVariables.add(p.name);
                    }
                });
            }
        });
    }
    return {
        requiredVariables: Array.from(requiredVariables),
        isLoading,
        isError
    };
}
