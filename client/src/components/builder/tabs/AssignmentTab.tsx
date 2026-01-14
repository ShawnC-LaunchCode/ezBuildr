import { useQueryClient } from "@tanstack/react-query";
import {
    ArrowRight,
    Check,
    Search,
    GitBranch,
    AlertCircle,
    Plus
} from "lucide-react";
import React, { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useWorkflow, useProjectWorkflows, useUpdateWorkflow, queryKeys } from "@/lib/vault-hooks";
// import { LogicBuilder } from "@/components/builder/logic/LogicBuilder"; // Assuming this exists or we use a simplified version
// If LogicBuilder doesn't exist at that path, we might need to build a simple condition builder here.
// Re-using specific parts if possible.

interface AssignmentRule {
    targetWorkflowId: string;
    condition: any; // ConditionExpression
    enabled: boolean;
}

export function AssignmentTab({ workflowId }: { workflowId: string }) {
    const { data: workflow } = useWorkflow(workflowId);
    // Fix: handle potentially null projectId by defaulting to undefined if it's absent
    const { data: projectWorkflows } = useProjectWorkflows(workflow?.projectId || undefined);
    const updateWorkflow = useUpdateWorkflow();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [searchTerm, setSearchTerm] = useState("");
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

    // Parse existing assignments
    const assignments: AssignmentRule[] = workflow?.intakeConfig?.assignments || [];

    // Filter out self and upstream (loops)
    const candidateWorkflows = projectWorkflows?.filter(w =>
        w.id !== workflowId &&
        w.intakeConfig?.upstreamWorkflowId === workflowId
    ) || [];

    // If a workflow is NOT linked as upstream, it shouldn't show up here? 
    // OR, this tab suggests which workflows *could* be assigned.
    // The Prompt says: "If intake data matches X, then make Y workflows available."
    // It implies we are creating the link HERE.
    // BUT Prompt 24 established that downstream workflows link UP to intake.
    // LET'S ASSUME: We only show workflows that have explicitly linked this Intake as their upstream.
    // OR, we show all, and if selected, we warn? 
    // Better: Show all project flows, but highlight linked ones.

    const filteredWorkflows = projectWorkflows?.filter(w =>
        w.id !== workflowId &&
        w.title.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    const handleToggleAssignment = async (targetId: string, currentEnabled: boolean) => {
        // If enabling, we need a rule entry. If disabling, we just set enabled: false?
        // Or we remove it?
        // Let's create a default rule if none exists.

        const newAssignments = [...assignments];
        const existingIndex = newAssignments.findIndex(a => a.targetWorkflowId === targetId);

        if (existingIndex >= 0) {
            newAssignments[existingIndex] = {
                ...newAssignments[existingIndex],
                enabled: !currentEnabled
            };
        } else {
            newAssignments.push({
                targetWorkflowId: targetId,
                condition: null, // Default: Always available? Or require condition?
                enabled: true
            });
        }

        try {
            await updateWorkflow.mutateAsync({
                id: workflowId,
                intakeConfig: {
                    ...workflow?.intakeConfig,
                    assignments: newAssignments
                }
            });
            toast({ title: "Updated assignment rules" });
        } catch (e) {
            toast({ title: "Failed to update", variant: "destructive" });
        }
    };

    return (
        <div className="container mx-auto max-w-4xl py-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold flex items-center gap-2">
                        <GitBranch className="w-6 h-6 text-indigo-500" />
                        Workflow Assignment Rules
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Determine which downstream workflows become available based on the intake data collected here.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Target Workflows</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search workflows..."
                                className="pl-9"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {filteredWorkflows.map(target => {
                            const rule = assignments.find(a => a.targetWorkflowId === target.id);
                            const isAssigned = rule?.enabled;
                            const isLinked = target.intakeConfig?.upstreamWorkflowId === workflowId;

                            return (
                                <div key={target.id} className={`
                                border rounded-lg p-4 transition-all
                                ${isAssigned ? 'border-indigo-200 bg-indigo-50/30' : 'border-border opacity-80 hover:opacity-100'}
                            `}>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3">
                                                <Switch
                                                    checked={isAssigned}
                                                    onCheckedChange={() => handleToggleAssignment(target.id, !!isAssigned)}
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
                                                onClick={() => setEditingRuleId(editingRuleId === target.id ? null : target.id)}
                                            >
                                                {editingRuleId === target.id ? "Close Condition" : "Edit Condition"}
                                            </Button>
                                        )}
                                    </div>

                                    {/* Condition Editor Area */}
                                    {isAssigned && editingRuleId === target.id && (
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
                                            {/* 
                                            TODO: Integrate <BlockRenderer> or <ConditionBuilder> here. 
                                            For now, we are just mocking the UI structure as per Prompt 25.
                                        */}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {filteredWorkflows.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                No workflows found matching your search.
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
