
import { AlertTriangle, ArrowRight, Lightbulb } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiSection, ApiStep } from "@/lib/vault-hooks";

// Utility to convert var.name or var_name to "Var Name"
const toFriendlyName = (variable: string) => {
    return variable
        .replace(/_/g, ' ')
        .replace(/\./g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase to Space
        .replace(/\b\w/g, c => c.toUpperCase());
};

interface MissingItemsListProps {
    missing: string[];
    sections: ApiSection[] | undefined;
    allSteps: Record<string, ApiStep[]>;
    onGoToSection: (sectionId: string) => void;
}

export function MissingItemsList({ missing, sections, allSteps, onGoToSection }: MissingItemsListProps) {
    // Helper to find a relevant page for a missing variable
    const getRelevantSectionId = (variableName: string): string | null => {
        if (!sections) { return null; }
        // Simple heuristic: matching prefix (e.g. "client." matches other "client." vars)
        const parts = variableName.split('.');
        const prefix = parts.length > 1 ? parts[0] : null; // Only use prefix if dot notation exists

        if (!prefix) { return null; }

        let bestSectionId: string | null = null;
        let maxMatches = 0;

        sections.forEach(section => {
            // Skip final docs or system sections
            // Safely check config
            const config = section.config as Record<string, unknown> | undefined;
            if (config?.finalBlock === true) { return; }

            const steps = allSteps[section.id] ?? [];
            let matches = 0;
            steps.forEach(step => {
                // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
                if (step.alias && step.alias.startsWith(`${prefix}.`)) {
                    matches++;
                }
            });

            if (matches > 0 && matches > maxMatches) {
                maxMatches = matches;
                bestSectionId = section.id;
            }
        });
        return bestSectionId;
    };

    return (
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
                                    onClick={() => onGoToSection(section.id)}
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
    );
}
