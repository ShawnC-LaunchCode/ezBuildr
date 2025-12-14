
import { useSections, useActiveTemplateVariables, useWorkflowVariables, useAllSteps, type ApiStep, type ApiSection } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, FileText, ChevronDown, ChevronUp, ArrowRight, Lightbulb } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DocumentStatusPanelProps {
    workflowId: string;
    projectId: string;
}

// Utility to convert var.name or var_name to "Var Name"
const toFriendlyName = (variable: string) => {
    return variable
        .replace(/_/g, ' ')
        .replace(/\./g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase to Space
        .replace(/\b\w/g, c => c.toUpperCase());
};

export function DocumentStatusPanel({ workflowId, projectId }: DocumentStatusPanelProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const { selectSection } = useWorkflowBuilder();

    // 1. Fetch sections
    const { data: sections } = useSections(workflowId);

    // 2. Fetch all steps (to find context)
    const allSteps = useAllSteps(sections || []);

    const finalDocsSection = sections?.find((s) => (s.config as any)?.finalBlock === true || s.title.toLowerCase().includes("document"));

    // 3. Get active templates from that section's config
    const sectionConfig = finalDocsSection?.config || {};

    // 4. Fetch required variables from those templates
    const { requiredVariables, isLoading: isLoadingVars } = useActiveTemplateVariables(projectId, sectionConfig);

    // 5. Fetch collected variables (workflow variables/aliases)
    const { data: workflowVars } = useWorkflowVariables(workflowId);

    if (!finalDocsSection) {
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

    const collectedAliases = new Set(workflowVars?.map(v => v.alias || v.key) || []);

    // Calculate coverage
    const missing = requiredVariables.filter(v => !collectedAliases.has(v));
    const total = requiredVariables.length;
    const collected = total - missing.length;
    const percentage = total > 0 ? Math.round((collected / total) * 100) : 100;

    const isComplete = missing.length === 0;

    // Helper to find a relevant page for a missing variable
    const getRelevantSectionId = (variableName: string): string | null => {
        if (!sections) return null;

        // Simple heuristic: matching prefix (e.g. "client." matches other "client." vars)
        const parts = variableName.split('.');
        const prefix = parts.length > 1 ? parts[0] : null; // Only use prefix if dot notation exists

        // If no prefix, maybe look for exact match of "term" in step titles? Too fuzzy. 
        // Let's stick to prefix grouping as it's safer for strict "Easy Mode" guidance.
        if (!prefix) return null;

        let bestSectionId: string | null = null;
        let maxMatches = 0;

        sections.forEach(section => {
            // Skip final docs or system sections
            if ((section.config as any)?.finalBlock) return;

            const steps = allSteps[section.id] || [];
            let matches = 0;
            steps.forEach(step => {
                if (step.alias && step.alias.startsWith(prefix + '.')) {
                    matches++;
                }
                // Also maybe check questions with similar names?
                // For now, strict prefix matching is safest to avoid bad advice.
            });

            if (matches > 0 && matches > maxMatches) {
                maxMatches = matches;
                bestSectionId = section.id;
            }
        });

        return bestSectionId;
    };

    const handleGoToSection = (sectionId: string) => {
        selectSection(sectionId);
        // Dispatch event or use logic to scroll to section if needed, 
        // but sidebar selection usually highlights it or scrolls into view.
        const element = document.getElementById(`section-${sectionId}`); // Assuming IDs exist in canvas
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
                            <div className="mt-2 space-y-2 max-h-[300px] overflow-y-auto pr-1">
                                {missing.map((name) => {
                                    const sectionId = getRelevantSectionId(name);
                                    const section = sectionId ? sections?.find(s => s.id === sectionId) : null;

                                    return (
                                        <div key={name} className="flex flex-col gap-1 text-xs bg-amber-50 dark:bg-amber-900/10 p-2 rounded border border-amber-100 dark:border-amber-800/20">
                                            <div className="flex items-start gap-2 text-amber-900 dark:text-amber-100">
                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                                                <span className="font-medium">
                                                    {toFriendlyName(name)}
                                                </span>
                                            </div>

                                            {section && (
                                                <div className="pl-5.5 mt-1">
                                                    <Button
                                                        variant="link"
                                                        className="h-auto p-0 text-amber-700 dark:text-amber-300 text-[10px] hover:text-amber-900"
                                                        onClick={() => handleGoToSection(section.id)}
                                                    >
                                                        Go to {section.title} <ArrowRight className="h-2.5 w-2.5 ml-1" />
                                                    </Button>
                                                </div>
                                            )}

                                            {!section && (
                                                <div className="pl-5.5 mt-1 flex items-center gap-1.5 text-amber-600/70 text-[10px]">
                                                    <Lightbulb className="h-2.5 w-2.5" />
                                                    <span>You may want to add a question for this.</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
