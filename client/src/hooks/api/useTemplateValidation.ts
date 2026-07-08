import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import axios from "axios";

import { queryKeys } from "./queryKeys";

/** Mirrors server/services/TemplateValidationService TemplateValidationReport */
export interface TemplateValidationReport {
    templateId: string;
    workflowId: string;
    placeholders: Array<{
        name: string;
        raw: string;
        kind: "variable" | "section" | "helper";
        helper?: string;
        loopScope: string[];
    }>;
    matched: string[];
    missing: Array<{
        placeholder: string;
        raw: string;
        suggestions: string[];
    }>;
    loopScoped: string[];
    unusedVariables: Array<{ alias: string; label: string }>;
    stepsWithoutAlias: Array<{ stepId: string; label: string; sectionTitle: string }>;
    syntaxErrors: string[];
    valid: boolean;
}

/**
 * Validate a DOCX template's placeholders against a workflow's variables.
 * Returns matched/missing placeholders (with fuzzy alias suggestions),
 * loop-scoped fields, and template syntax errors.
 */
export function useTemplateValidation(
    templateId: string | undefined,
    workflowId: string | undefined,
    enabled: boolean = true
): UseQueryResult<TemplateValidationReport> {
    return useQuery({
        queryKey: queryKeys.templateValidation(templateId ?? "", workflowId ?? ""),
        queryFn: async () => {
            const response = await axios.get<TemplateValidationReport>(
                `/api/templates/${templateId}/validate`,
                { params: { workflowId } }
            );
            return response.data;
        },
        enabled: enabled && !!templateId && !!workflowId,
        staleTime: 30_000,
    });
}
