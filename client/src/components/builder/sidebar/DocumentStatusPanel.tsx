import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { usePages, useActiveTemplateVariables, useWorkflowVariables, useAllSteps } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

import { MissingItemsList } from "./document-status/MissingItemsList";

interface DocumentStatusPanelProps {
    workflowId: string;
    projectId: string;
}

export function DocumentStatusPanel({ workflowId, projectId }: DocumentStatusPanelProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const { selectPage } = useWorkflowBuilder();
    // 1. Fetch pages
    const { data: pages } = usePages(workflowId);
    // 2. Fetch all steps (to find context)
    const allSteps = useAllSteps(pages ?? []);

    // Find final docs page safely with explicit boolean check
    const finalDocsPage = pages?.find((s) => {
        const config = s.config as Record<string, unknown> | undefined;
        return config?.finalBlock === true || s.title.toLowerCase().includes("document");
    });

    // 3. Get active templates from that page's config
    const pageConfig = finalDocsPage?.config ?? {};
    // 4. Fetch required variables from those templates
    const { requiredVariables, isLoading: isLoadingVars } = useActiveTemplateVariables(projectId, pageConfig);
    // 5. Fetch collected variables (workflow variables/aliases)
    const { data: workflowVars } = useWorkflowVariables(workflowId);

    if (!finalDocsPage) {
        return null;
    }

    if (isLoadingVars) {
        return (
            <div className="p-4 border-b">
                <div className="h-4 w-1/2 bg-muted animate-pulse rounded mb-2" />
                <div className="h-2 w-full bg-muted animate-pulse rounded" />
            </div>
        );
    }

    const collectedAliases = new Set(workflowVars?.map(v => v.alias ?? v.key) ?? []);
    // Calculate coverage
    const missing = requiredVariables.filter(v => !collectedAliases.has(v));
    const total = requiredVariables.length;
    const collected = total - missing.length;
    const percentage = total > 0 ? Math.round((collected / total) * 100) : 100;
    const isComplete = missing.length === 0;

    const handleGoToPage = (pageId: string) => {
        selectPage(pageId);
        // Dispatch event or use logic to scroll to page if needed,
        // but sidebar selection usually highlights it or scrolls into view.
        const element = document.getElementById(`page-${pageId}`); // Assuming IDs exist in canvas
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    if (total === 0) {
        return (
            <div className="p-4 border-b bg-muted/20">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm font-medium">No documents selected</span>
                </div>
            </div>
        )
    }

    return (
        <div className="border-b bg-card">
            <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        Document Readiness
                    </h3>
                    {isComplete ? (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700">Ready</Badge>
                    ) : (
                        <Badge variant="secondary" className="text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400">
                            {collected}/{total} Collected
                        </Badge>
                    )}
                </div>
                <div className="space-y-2">
                    <Progress value={percentage} className={cn("h-2", isComplete && "bg-green-100 [&>div]:bg-green-600")} />
                    <p className="text-xs text-muted-foreground">
                        {isComplete
                            ? "All required information has been collected."
                            : `You still need to collect ${missing.length} piece${missing.length === 1 ? '' : 's'} of information.`
                        }
                    </p>
                </div>
                {!isComplete && (
                    <div className="mt-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-between h-8 text-xs font-normal"
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            <span>View missing items</span>
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                        {isExpanded && (
                            <MissingItemsList
                                missing={missing}
                                pages={pages}
                                allSteps={allSteps}
                                onGoToPage={handleGoToPage}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
