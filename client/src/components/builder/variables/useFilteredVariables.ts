
import { useMemo } from "react";

import { type ApiWorkflowVariable } from "@/lib/vault-api";

import { isListType } from "./utils";

interface FilteredVariablesReturn {
    filteredVariables: ApiWorkflowVariable[];
    groupedVariables: Record<string, ApiWorkflowVariable[]>;
    counts: {
        total: number;
        lists: number;
        computed: number;
    };
}

export function useFilteredVariables(
    variables: ApiWorkflowVariable[],
    searchQuery: string,
    activeTab: string
): FilteredVariablesReturn {
    const filteredVariables = useMemo(() => {
        return variables.filter((v) => {
            if (searchQuery && !v.alias?.toLowerCase().includes(searchQuery.toLowerCase()) && !v.label?.toLowerCase().includes(searchQuery.toLowerCase())) {
                return false;
            }
            if (activeTab === "all") { return true; }
            if (activeTab === "lists") { return isListType(v.type); }
            if (activeTab === "computed") { return v.type === "js_question" || v.type === "computed"; }
            if (activeTab === "questions") { return !isListType(v.type) && v.type !== "js_question" && v.type !== "computed"; }
            return true;
        });
    }, [variables, searchQuery, activeTab]);

    const groupedVariables = useMemo(() => {
        return filteredVariables.reduce((acc, variable) => {
            const page = variable.pageTitle ?? "Other";
            if (acc[page] === undefined) {
                acc[page] = [];
            }
            acc[page].push(variable);
            return acc;
        }, {} as Record<string, ApiWorkflowVariable[]>);
    }, [filteredVariables]);

    const counts = useMemo(() => {
        return {
            total: filteredVariables.length,
            lists: filteredVariables.filter(v => isListType(v.type)).length,
            computed: filteredVariables.filter(v => v.type === "js_question" || v.type === "computed").length
        };
    }, [filteredVariables]);

    return { filteredVariables, groupedVariables, counts };
}
