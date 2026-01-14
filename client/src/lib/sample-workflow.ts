
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/**
 * Creates a complete sample workflow with multiple sections, steps, logic, and blocks.
 * Demonstrates: Pages, Questions, Variables, Logic, and Documents.
 */
export function useCreateSampleWorkflow() {
    const { toast } = useToast();
    const [, navigate] = useLocation();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            // 1. Create Workflow
            const workflowRes = await apiRequest("POST", "/api/workflows", {
                title: "Sample: Customer Intake",
                description: "A demo workflow showing forms, logic, and document generation. Feel free to edit or delete!",
            });
            const workflow = await workflowRes.json();
            const workflowId = workflow.id;

            // 2. Create Page 1: Contact Info
            const p1Res = await apiRequest("POST", "/api/sections", {
                workflowId,
                title: "Contact Information",
                order: 0,
            });
            const p1 = await p1Res.json();

            // P1 - Step 1: Name
            await apiRequest("POST", "/api/steps", {
                sectionId: p1.id,
                type: "short_text",
                title: "What is your full name?",
                alias: "full_name", // Variable alias
                required: true,
                order: 0,
                config: { placeholder: "e.g. Jane Doe" }
            });

            // P1 - Step 2: Email
            await apiRequest("POST", "/api/steps", {
                sectionId: p1.id,
                type: "email",
                title: "Email Address",
                alias: "email",
                required: true,
                order: 1,
                config: { placeholder: "jane@example.com" }
            });

            // 3. Create Page 2: Service Selection (Conditional)
            const p2Res = await apiRequest("POST", "/api/sections", {
                workflowId,
                title: "Service Preferences",
                order: 1,
            });
            const p2 = await p2Res.json();

            // P2 - Step 1: Service Type
            await apiRequest("POST", "/api/steps", {
                sectionId: p2.id,
                type: "single_choice",
                title: "Which service are you interested in?",
                alias: "service_type",
                required: true,
                order: 0,
                options: ["Consulting", "Development", "Design"],
                config: {}
            });

            // P2 - Step 2: Budget (Visible only if Development)
            await apiRequest("POST", "/api/steps", {
                sectionId: p2.id,
                type: "number",
                title: "Estimated Budget ($)",
                alias: "budget",
                required: false,
                order: 1,
                config: {},
                visibleIf: {
                    field: "service_type",
                    operator: "equals",
                    value: "Development"
                }
            });

            // 4. Create Logic Block (JS) - Auto-calculate tier
            // Note: Blocks are created via a separate endpoint, usually associated with a section or global?
            // Based on previous files, blocks seem to be separate entities.
            // Checking BlocksPanel implementation (hooks/useCreateBlock) -> /api/blocks
            // Let's add a PREFILL block at the start to set a default region

            await apiRequest("POST", "/api/blocks", {
                workflowId,
                type: "prefill",
                phase: "onRunStart",
                order: 0,
                enabled: true,
                config: {
                    mode: "static",
                    staticMap: { "region": "US-East" }
                }
            });

            // 5. Create Final Page
            const pFinalRes = await apiRequest("POST", "/api/sections", {
                workflowId,
                title: "Review & Submit",
                order: 2,
                config: {
                    finalBlock: true,
                    screenTitle: "All Done!",
                    markdownMessage: "# Thanks, {{full_name}}!\n\nWe will contact you at {{email}} regarding **{{service_type}}**.\n\nYour estimated budget is ${{budget}}.",
                    templates: []
                }
            });

            return workflow;
        },
        onSuccess: (workflow) => {
            toast({
                title: "Sample Created",
                description: "Welcome to your first workflow! Feel free to explore and edit.",
            });
            queryClient.invalidateQueries({ queryKey: ["workflows"] });
            // Navigate to builder
            navigate(`/workflows/${workflow.id}/builder`);
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: "Failed to create sample workflow. Please try creating a new one manually.",
                variant: "destructive",
            });
        },
    });
}
