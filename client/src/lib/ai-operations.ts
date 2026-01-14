
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCreateSection, useCreateStep, useUpdateStep, useUpdateWorkflow } from "@/lib/vault-hooks";

/**
 * AI Operations Application Logic
 * 
 * Takes the raw JSON suggestion from the AI backend and orchestrates the necessary
 * client-side mutations to apply those changes to the workflow.
 * 
 * This ensures that all validation, internal ID generation, and side-effects
 * (like updating the sidebar or graph) happen consistently with manual edits.
 */

interface AiSuggestion {
    newSections?: Array<{
        title: string;
        order?: number;
        steps?: Array<{
            title: string;
            type: string;
            description?: string;
        }>
    }>;
    newSteps?: Array<{
        sectionId: string; // might be "last" or "new" or a real ID if context was passed
        title: string;
        type: string;
    }>;
    // We can expand this for modifications later
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
        createSection: any,
        createStep: any
    }
) {
    console.log("Applying AI Suggestions:", suggestions);
    const sectionMap: Record<string, string> = {}; // map temporary IDs/Indices to real IDs

    try {
        // 1. Create New Sections
        if (suggestions.newSections) {
            for (const section of suggestions.newSections) {
                // Calculate order if not provided (append)
                const sectionData = {
                    workflowId,
                    title: section.title,
                    order: section.order ?? 999
                };

                const newSection = await mutations.createSection.mutateAsync(sectionData);

                // Add Steps for this new section
                if (section.steps) {
                    for (const step of section.steps) {
                        await mutations.createStep.mutateAsync({
                            sectionId: newSection.id,
                            title: step.title,
                            type: normalizeStepType(step.type),
                            order: 999 // auto-append
                        });
                    }
                }
            }
        }

        // 2. Add Steps to Existing Sections (if any)
        if (suggestions.newSteps) {
            for (const step of suggestions.newSteps) {
                // We need a way to resolve sectionId if it's vague. 
                // For MVP, we might assume it's adding to the currently selected section or the last one.
                // If sectionId is missing, we skip or error.
                if (step.sectionId) {
                    await mutations.createStep.mutateAsync({
                        sectionId: step.sectionId,
                        title: step.title,
                        type: normalizeStepType(step.type),
                        order: 999
                    });
                }
            }
        }

        toast({ title: "Changes Applied", description: "AI suggestions have been successfully applied." });
        return true;

    } catch (error: any) {
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
    if (t.includes("text") || t.includes("string")) {return "text";}
    if (t.includes("number") || t.includes("int")) {return "number";}
    if (t.includes("bool") || t.includes("toggle")) {return "boolean";}
    if (t.includes("choice") || t.includes("option") || t.includes("select")) {return "select";}
    if (t.includes("date")) {return "date";}
    if (t.includes("email")) {return "email";}
    return "text"; // Default fallback
}
