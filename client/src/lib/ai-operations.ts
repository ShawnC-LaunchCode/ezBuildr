import { toast } from "@/hooks/use-toast";

/**
 * AI Operations Application Logic
 * 
 * Takes the raw JSON suggestion from the AI backend and orchestrates the necessary
 * client-side mutations to apply those changes to the workflow.
 * 
 * This ensures that all validation, internal ID generation, and side-effects
 * (like updating the sidebar or graph) happen consistently with manual edits.
 */
export interface AiSuggestion {
    newPages?: Array<{
        title: string;
        order?: number;
        steps?: Array<{
            title: string;
            type: string;
            description?: string;
        }>
    }>;
    newSteps?: Array<{
        pageId: string; // might be "last" or "new" or a real ID if context was passed
        title: string;
        type: string;
    }>;
    // We can expand this for modifications later
}
interface CreatePageInput {
    workflowId: string;
    title: string;
    order: number;
}

interface CreateStepInput {
    pageId: string;
    title: string;
    type: string;
    order: number;
}

interface AsyncMutation<TInput, TResult> {
    mutateAsync(input: TInput): Promise<TResult>;
}

interface PageMutationResult {
    id: string;
}
// NOTE: This function needs to be used within a React component or hook context because 
// it relies on TanStack Query hooks. 
// However, hooks can't be called conditionally or in loops easily.
// A better pattern for this "Batch Operation" is to use the QueryClient directly 
// or pass the mutate functions in.
export async function applyAiSuggestions(
    workflowId: string,
    suggestions: AiSuggestion,
    // dependencies passed in to avoid hook rules issues
    mutations: {
        createPage: AsyncMutation<CreatePageInput, PageMutationResult>;
        createStep: AsyncMutation<CreateStepInput, unknown>;
    }

): Promise<boolean> {
    // eslint-disable-next-line no-console
    console.log("Applying AI Suggestions:", suggestions);
    const _pageMap: Record<string, string> = {}; // map temporary IDs/Indices to real IDs
    try {
        // 1. Create New Pages
        if (suggestions.newPages) {
            for (const page of suggestions.newPages) {
                // Calculate order if not provided (append)
                const pageData = {
                    workflowId,
                    title: page.title,
                    order: page.order ?? 999
                };
                const newPage = await mutations.createPage.mutateAsync(pageData);
                // Add Steps for this new page
                if (page.steps) {
                    for (const step of page.steps) {
                        await mutations.createStep.mutateAsync({
                            pageId: newPage.id,
                            title: step.title,
                            type: normalizeStepType(step.type),
                            order: 999 // auto-append
                        });
                    }
                }
            }
        }
        // 2. Add Steps to Existing Pages (if any)
        if (suggestions.newSteps) {
            for (const step of suggestions.newSteps) {
                // We need a way to resolve pageId if it's vague.
                // For MVP, we might assume it's adding to the currently selected page or the last one.
                // If pageId is missing, we skip or error.
                if (step.pageId) {
                    await mutations.createStep.mutateAsync({
                        pageId: step.pageId,
                        title: step.title,
                        type: normalizeStepType(step.type),
                        order: 999
                    });
                }
            }
        }
        toast({ title: "Changes Applied", description: "AI suggestions have been successfully applied." });
        return true;
    } catch (error: unknown) {
        console.error("Failed to apply AI changes:", error);
        toast({
            title: "Application Failed",
            description: "Could not apply some changes. The workflow state might be partial.",
            variant: "destructive"
        });
        return false;
    }
}
function normalizeStepType(type: string): string {
    const t = type.toLowerCase();
    if (t.includes("text") || t.includes("string")) { return "text"; }
    if (t.includes("number") || t.includes("int")) { return "number"; }
    if (t.includes("bool") || t.includes("toggle")) { return "boolean"; }
    if (t.includes("choice") || t.includes("option") || t.includes("select")) { return "select"; }
    if (t.includes("date")) { return "date"; }
    if (t.includes("email")) { return "email"; }
    return "text"; // Default fallback
}
