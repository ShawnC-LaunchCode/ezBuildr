/**
 * LogicRulesTab - author, edit, reorder, and delete workflow rules (LU-6b).
 *
 * A rule is workflow-scoped (push model: "when this fires, act on that
 * target"), which is why it lives here in the workflow-scoped Logic
 * Inspector rather than the selection-scoped `LogicPanel` (which edits an
 * element's own pull-model `visibleIf`). Ordering is author-visible, not
 * cosmetic: `evaluateRules` (shared/workflowLogic.ts) sorts section-targeted
 * rules by `order` and the first firing `skip_to` wins, so an author needs
 * explicit control over which rule fires first.
 */
import { AlertTriangle, ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
    useCreateLogicRule,
    useDeleteLogicRule,
    useLogicRules,
    useReorderLogicRules,
    useUpdateLogicRule,
} from "@/hooks/api/useLogicRules";
import { useSections, useWorkflowSteps } from "@/lib/vault-hooks";
import type { ApiLogicRule, LogicRuleInput } from "@/lib/vault-api";

import { describeConditionExpression } from "@shared/conditionEvaluator";

import { LogicRuleEditor } from "./LogicRuleEditor";

const ACTION_LABELS: Record<ApiLogicRule["action"], string> = {
    show: "Show",
    hide: "Hide",
    require: "Require",
    make_optional: "Make optional",
    skip_to: "Skip to",
};

type EditorMode = { type: "idle" } | { type: "creating" } | { type: "editing"; ruleId: string };

interface LogicRulesTabProps {
    workflowId: string;
}

export function LogicRulesTab({ workflowId }: LogicRulesTabProps) {
    const { toast } = useToast();
    const { data: rules, isLoading: rulesLoading } = useLogicRules(workflowId);
    const { data: steps } = useWorkflowSteps(workflowId);
    const { data: sections } = useSections(workflowId);

    const createRule = useCreateLogicRule();
    const updateRule = useUpdateLogicRule();
    const deleteRule = useDeleteLogicRule();
    const reorderRules = useReorderLogicRules();

    const [mode, setMode] = useState<EditorMode>({ type: "idle" });
    const [deleteTarget, setDeleteTarget] = useState<ApiLogicRule | null>(null);

    const variableLabels = useMemo(() => {
        const labels: Record<string, string> = {};
        (steps ?? []).forEach((step) => {
            const label = step.alias ?? step.title;
            labels[step.id] = label;
            if (step.alias) { labels[step.alias] = step.alias; }
        });
        return labels;
    }, [steps]);

    const targetLabel = (rule: ApiLogicRule): string => {
        if (rule.targetType === "section") {
            return sections?.find((s) => s.id === rule.targetSectionId)?.title ?? "Unknown section";
        }
        const step = steps?.find((s) => s.id === rule.targetStepId);
        return step ? (step.alias ?? step.title) : "Unknown question";
    };

    const isSaving = createRule.isPending || updateRule.isPending;

    const handleCreate = (input: LogicRuleInput) => {
        createRule.mutate(
            { workflowId, ...input },
            {
                onSuccess: () => {
                    setMode({ type: "idle" });
                    toast({ title: "Rule added" });
                },
                onError: (error) => {
                    toast({
                        title: "Failed to add rule",
                        description: error instanceof Error ? error.message : undefined,
                        variant: "destructive",
                    });
                },
            }
        );
    };

    const handleUpdate = (ruleId: string, input: LogicRuleInput) => {
        updateRule.mutate(
            { id: ruleId, workflowId, ...input },
            {
                onSuccess: () => {
                    setMode({ type: "idle" });
                    toast({ title: "Rule saved" });
                },
                onError: (error) => {
                    toast({
                        title: "Failed to save rule",
                        description: error instanceof Error ? error.message : undefined,
                        variant: "destructive",
                    });
                },
            }
        );
    };

    const handleDelete = () => {
        if (!deleteTarget) { return; }
        deleteRule.mutate(
            { id: deleteTarget.id, workflowId },
            {
                onSuccess: () => toast({ title: "Rule deleted" }),
                onError: (error) => toast({
                    title: "Failed to delete rule",
                    description: error instanceof Error ? error.message : undefined,
                    variant: "destructive",
                }),
            }
        );
        setDeleteTarget(null);
    };

    const move = (index: number, direction: -1 | 1) => {
        if (!rules) { return; }
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= rules.length) { return; }
        const a = rules[index];
        const b = rules[targetIndex];
        reorderRules.mutate({
            workflowId,
            rules: [
                { id: a.id, order: b.order },
                { id: b.id, order: a.order },
            ],
        });
    };

    if (rulesLoading) {
        return (
            <div className="p-4 space-y-3">
                <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-20 bg-muted rounded" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    Rules act on a section or question when their condition is met. The first
                    matching &quot;Skip to&quot; rule wins - use the order controls to prioritize.
                </p>
            </div>

            {mode.type === "creating" && (
                <LogicRuleEditor
                    workflowId={workflowId}
                    steps={steps ?? []}
                    sections={sections ?? []}
                    isSaving={isSaving}
                    onSave={handleCreate}
                    onCancel={() => setMode({ type: "idle" })}
                />
            )}

            <div className="space-y-2">
                {(rules ?? []).length === 0 && mode.type !== "creating" && (
                    <Alert>
                        <AlertDescription>
                            No rules yet. Rules let you show, hide, require, or skip based on
                            earlier answers - add one to get started.
                        </AlertDescription>
                    </Alert>
                )}

                {(rules ?? []).map((rule, index) => {
                    if (mode.type === "editing" && mode.ruleId === rule.id) {
                        return (
                            <LogicRuleEditor
                                key={rule.id}
                                workflowId={workflowId}
                                steps={steps ?? []}
                                sections={sections ?? []}
                                rule={rule}
                                isSaving={isSaving}
                                onSave={(input) => handleUpdate(rule.id, input)}
                                onCancel={() => setMode({ type: "idle" })}
                            />
                        );
                    }

                    return (
                        <div key={rule.id} className="rounded-md border p-3 space-y-2" data-testid={`logic-rule-${rule.id}`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge variant={rule.action === "hide" ? "destructive" : "secondary"}>
                                        {ACTION_LABELS[rule.action]}
                                    </Badge>
                                    <span className="text-sm font-medium">{targetLabel(rule)}</span>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        aria-label="Move rule up"
                                        disabled={index === 0 || reorderRules.isPending}
                                        onClick={() => move(index, -1)}
                                    >
                                        <ArrowUp className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        aria-label="Move rule down"
                                        disabled={index === (rules?.length ?? 0) - 1 || reorderRules.isPending}
                                        onClick={() => move(index, 1)}
                                    >
                                        <ArrowDown className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        aria-label="Edit rule"
                                        onClick={() => setMode({ type: "editing", ruleId: rule.id })}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive"
                                        aria-label="Delete rule"
                                        onClick={() => setDeleteTarget(rule)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                When: {describeConditionExpression(rule.when, variableLabels)}
                            </p>
                        </div>
                    );
                })}
            </div>

            {mode.type === "idle" && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => setMode({ type: "creating" })}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add rule
                </Button>
            )}

            <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); } }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                            Delete this rule?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the rule permanently. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
