
import { GitBranch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApiWorkflow } from "@/lib/vault-hooks";

// Define the rule interface here or import it
export interface AssignmentRule {
    targetWorkflowId: string;
    condition: any; // Keeping any for now to match original, should be refined later
    enabled: boolean;
}

interface AssignmentRuleCardProps {
    target: ApiWorkflow;
    rule: AssignmentRule | undefined;
    isLinked: boolean;
    isEditing: boolean;
    onToggle: (targetId: string, currentEnabled: boolean) => void;
    onEditClick: (targetId: string) => void;
}

export function AssignmentRuleCard({
    target,
    rule,
    isLinked,
    isEditing,
    onToggle,
    onEditClick
}: AssignmentRuleCardProps) {
    const isAssigned = rule?.enabled ?? false;

    return (
        <div className={`
            border rounded-lg p-4 transition-all
            ${isAssigned ? 'border-indigo-200 bg-indigo-50/30' : 'border-border opacity-80 hover:opacity-100'}
        `}>
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <Switch
                            checked={isAssigned}
                            onCheckedChange={() => onToggle(target.id, isAssigned)}
                        />
                        <div>
                            <div className="font-medium flex items-center gap-2">
                                {target.title}
                                {isLinked && (
                                    <Badge variant="outline" className="text-[10px] text-emerald-600 bg-emerald-50 border-emerald-200 h-5">
                                        Linked
                                    </Badge>
                                )}
                            </div>
                            <div className="text-sm text-muted-foreground mt-0.5">
                                {isAssigned
                                    ? (rule?.condition ? "Available when condition is met" : "Always available after intake")
                                    : "Not assigned"
                                }
                            </div>
                        </div>
                    </div>
                </div>
                {isAssigned && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="ml-4"
                        onClick={() => onEditClick(target.id)}
                    >
                        {isEditing ? "Close Condition" : "Edit Condition"}
                    </Button>
                )}
            </div>
            {/* Condition Editor Area */}
            {isAssigned && isEditing && (
                <div className="mt-4 pl-12 border-t pt-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2 text-indigo-600 uppercase tracking-wider">
                        Assignment Condition
                    </p>
                    <div className="bg-background border rounded-md p-4 min-h-[100px] flex items-center justify-center text-muted-foreground text-sm border-dashed">
                        Condition Builder Placeholder
                        {/* We will implement the actual logic builder integration later if needed */}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        Only verify assignment if this condition evaluates to true. Leave empty to always assign.
                    </p>
                </div>
            )}
        </div>
    );
}
