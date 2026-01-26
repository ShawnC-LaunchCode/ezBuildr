import { CheckCircle2, ArrowRight, GitBranch, AlertCircle, FileText } from "lucide-react";
import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiWorkflow } from "@/lib/vault-api";
import { useProjectWorkflows } from "@/lib/vault-hooks";
import { evaluateConditionExpression } from "@shared/conditionEvaluator";
interface AssignmentRule {
    targetWorkflowId: string;
    condition: any;
    enabled: boolean;
}
interface IntakeAssignmentSectionProps {
    workflow: ApiWorkflow;
    runValues: Record<string, any>;
    onComplete?: () => void;
}
export function IntakeAssignmentSection({ workflow, runValues, onComplete }: IntakeAssignmentSectionProps) {
    // Fetch candidate workflows to display their names/details
    const { data: projectWorkflows } = useProjectWorkflows(workflow.projectId || undefined);
    // Evaluate assignments
    const assignedWorkflows = useMemo(() => {
        if (!workflow.intakeConfig?.assignments) { return []; }
        if (!projectWorkflows) { return []; }
        const assignments = workflow.intakeConfig.assignments as AssignmentRule[];
        return assignments
            .filter(rule => {
                if (!rule.enabled) { return false; }
                // If no condition, it's always available
                if (!rule.condition) { return true; }
                // Evaluate condition against run values
                // Note: evaluateConditionExpression generic might need 'any' cast if strict types aren't matching
                try {
                    return evaluateConditionExpression(rule.condition, runValues);
                } catch (e) {
                    console.error("Failed to evaluate assignment rule", e);
                    return false;
                }
            })
            .map(rule => {
                const target = projectWorkflows.find(w => w.id === rule.targetWorkflowId);
                return {
                    ...rule,
                    targetWorkflow: target
                };
            })
            .filter(item => item.targetWorkflow); // Ensure target exists
    }, [workflow.intakeConfig, runValues, projectWorkflows]);
    return (
        <div className="space-y-6">
            <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <CheckCircle2 className="h-6 w-6" />
                        </div>
                        <div>
                            <CardTitle className="text-xl">Intake Complete</CardTitle>
                            <CardDescription>Client data has been successfully recorded.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>
            <div className="grid gap-4 md:grid-cols-1">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <GitBranch className="h-5 w-5 text-secondary" />
                    Recommended Next Actions
                </h3>
                {assignedWorkflows.length > 0 ? (
                    <div className="grid gap-4">
                        {assignedWorkflows.map(({ targetWorkflow }, index) => (
                            <Card key={targetWorkflow!.id} className="hover:border-secondary transition-colors">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 bg-secondary/10 rounded-lg flex items-center justify-center text-secondary">
                                            <FileText className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h4 className="font-semibold">{targetWorkflow!.title}</h4>
                                            <p className="text-sm text-muted-foreground line-clamp-1">
                                                {targetWorkflow!.description || "No description"}
                                            </p>
                                        </div>
                                    </div>
                                    <Button variant="outline" className="gap-2">
                                        Start Workflow <ArrowRight className="h-4 w-4" />
                                    </Button>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <Card>
                        <CardContent className="p-6 text-center text-muted-foreground flex flex-col items-center gap-2">
                            <AlertCircle className="h-8 w-8 opacity-50" />
                            <p>No specific workflows matched the intake criteria.</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}