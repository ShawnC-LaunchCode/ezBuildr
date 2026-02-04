import { useQueryClient } from "@tanstack/react-query";
import {
    Search,
    GitBranch,
} from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useWorkflow, useProjectWorkflows, useUpdateWorkflow } from "@/lib/vault-hooks";

import { AssignmentRuleCard, AssignmentRule } from "./assignment/AssignmentRuleCard";

export function AssignmentTab({ workflowId }: { workflowId: string }) {
    const { data: workflow } = useWorkflow(workflowId);
    // Fix: handle potentially null projectId by defaulting to undefined if it's absent
    const { data: projectWorkflows } = useProjectWorkflows(workflow?.projectId ?? undefined);
    const updateWorkflow = useUpdateWorkflow();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState("");
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

    // Parse existing assignments
    const assignments: AssignmentRule[] = (workflow?.intakeConfig?.assignments as AssignmentRule[] | undefined) ?? [];

    const filteredWorkflows = projectWorkflows?.filter(w =>
        w.id !== workflowId &&
        w.title.toLowerCase().includes(searchTerm.toLowerCase())
    ) ?? [];

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
                            const isLinked = target.intakeConfig?.upstreamWorkflowId === workflowId;

                            return (
                                <AssignmentRuleCard
                                    key={target.id}
                                    target={target}
                                    rule={rule}
                                    isLinked={!!isLinked}
                                    isEditing={editingRuleId === target.id}
                                    onToggle={handleToggleAssignment}
                                    onEditClick={(id) => setEditingRuleId(editingRuleId === id ? null : id)}
                                />
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