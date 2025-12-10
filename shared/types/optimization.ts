import { z } from "zod";

// Issue Categories
export type OptimizationCategory =
    | "page_structure"
    | "block_structure"
    | "logic"
    | "documents"
    | "performance"
    | "accessibility"
    | "naming";

// Optimization Issue
export interface OptimizationIssue {
    id: string;
    category: OptimizationCategory;
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    description: string;
    location?: {
        pageId?: string;
        blockId?: string;
        path?: string; // Path to property in JSON
    };
    fixable: boolean;
    suggestedFix?: OptimizationFix;
}

// Optimization Fix
export interface OptimizationFix {
    type:
    | "split_page"
    | "merge_pages"
    | "move_block"
    | "delete_block"
    | "update_property"
    | "rename_variable"
    | "simplify_logic"
    | "reorder_pages";
    description: string;
    payload: Record<string, any>; // Flexible payload for the specific fix action
}

// Optimization Suggestion (Higher level improvement)
export interface OptimizationSuggestion {
    id: string;
    title: string;
    description: string;
    impact: "low" | "medium" | "high";
    effort: "low" | "medium" | "high";
    relatedIssues: string[]; // IDs of issues this suggestion resolves
}

// Workflow Metrics
export interface WorkflowMetrics {
    totalBlocks: number;
    totalPages: number;
    avgBlocksPerPage: number;
    estimatedCompletionTimeMs: number;
    cyclomaticComplexity: number; // Logic complexity score
    unusedVariablesCount: number;
    readabilityScore: number;
}

// Analysis Result
export interface OptimizationResult {
    issues: OptimizationIssue[];
    suggestions: OptimizationSuggestion[];
    optimizationScore: number; // 0-100
    metrics: WorkflowMetrics;
    timestamp: string;
}

// Zod Schemas for API Validation
export const AnalyzeWorkflowSchema = z.object({
    workflowId: z.string().uuid(),
    workflow: z.any(), // WorkflowJSON validator would be better if we had it handy, using any for now to avoid circular deps
    options: z
        .object({
            includeLogicAnalysis: z.boolean().optional(),
            includePageStructure: z.boolean().optional(),
            includeBlockStructure: z.boolean().optional(),
            includePerformanceAnalysis: z.boolean().optional(),
        })
        .optional(),
});

export const ApplyFixesSchema = z.object({
    workflow: z.any(),
    fixes: z.array(z.any()), // Validating exact fix structure might be complex here
});

export type AnalyzeWorkflowRequest = z.infer<typeof AnalyzeWorkflowSchema>;
export type ApplyFixesRequest = z.infer<typeof ApplyFixesSchema>;
