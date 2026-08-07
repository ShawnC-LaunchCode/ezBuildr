/**
 * LogicRuleEditor - create/edit form for a single workflow rule (LU-6b).
 *
 * A rule is push-model ("when this condition fires, act on that target"),
 * unlike a step/section's own `visibleIf` (pull-model, "show me when...").
 * The trigger condition (`when`) is still authored with the shared
 * `LogicBuilder` - the same editor steps/sections use - wrapped with target
 * and action pickers, per the ticket's "do not build a second condition
 * editor" instruction.
 */
import { useMemo, useState } from "react";

import { LogicBuilder } from "@/components/logic";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { ApiLogicRule, ApiSection, ApiStep, LogicRuleAction, LogicRuleInput, LogicRuleTargetType } from "@/lib/vault-api";

import { hasValidConditions } from "@shared/types/conditions";
import type { ConditionExpression } from "@shared/types/conditions";

/**
 * Actions `evaluateRules` (shared/workflowLogic.ts) applies per target type.
 * Mirrors `SECTION_ACTIONS`/`STEP_ACTIONS` in server/services/LogicRuleService.ts
 * exactly - `skip_to` only makes sense as a navigation target (a section),
 * and `require`/`make_optional` only make sense against a step's own
 * requiredness. Kept here (not imported) because this is presentation
 * copy for the picker, not the enforcement - the server independently
 * rejects any mismatch.
 */
const ACTIONS_BY_TARGET: Record<LogicRuleTargetType, Array<{ value: LogicRuleAction; label: string }>> = {
    section: [
        { value: "show", label: "Show" },
        { value: "hide", label: "Hide" },
        { value: "skip_to", label: "Skip to" },
    ],
    step: [
        { value: "show", label: "Show" },
        { value: "hide", label: "Hide" },
        { value: "require", label: "Require" },
        { value: "make_optional", label: "Make optional" },
    ],
};

interface LogicRuleEditorProps {
    workflowId: string;
    steps: ApiStep[];
    sections: ApiSection[];
    /** Undefined = creating a new rule. */
    rule?: ApiLogicRule;
    isSaving: boolean;
    onSave: (input: LogicRuleInput) => void;
    onCancel: () => void;
}

export function LogicRuleEditor({ workflowId, steps, sections, rule, isSaving, onSave, onCancel }: LogicRuleEditorProps) {
    const { toast } = useToast();
    const [targetType, setTargetType] = useState<LogicRuleTargetType>(rule?.targetType ?? "section");
    const [targetId, setTargetId] = useState<string>((rule?.targetType === "section" ? rule.targetSectionId : rule?.targetStepId) ?? "");
    const [action, setAction] = useState<LogicRuleAction>(rule?.action ?? "show");
    const [when, setWhen] = useState<ConditionExpression>(rule?.when ?? null);

    const availableActions = ACTIONS_BY_TARGET[targetType];

    const targetOptions = useMemo(
        () => (targetType === "section"
            ? sections.map((s) => ({ id: s.id, label: s.title }))
            : steps.map((s) => ({ id: s.id, label: s.alias ? `${s.title} (${s.alias})` : s.title }))),
        [targetType, sections, steps]
    );

    const handleTargetTypeChange = (value: LogicRuleTargetType) => {
        setTargetType(value);
        setTargetId("");
        if (!ACTIONS_BY_TARGET[value].some((a) => a.value === action)) {
            setAction(ACTIONS_BY_TARGET[value][0].value);
        }
    };

    const handleSave = () => {
        if (!targetId) {
            toast({ title: "Choose a target", description: "Pick which section or question this rule affects.", variant: "destructive" });
            return;
        }
        if (!hasValidConditions(when)) {
            toast({ title: "Add a condition", description: "A rule needs at least one trigger condition.", variant: "destructive" });
            return;
        }

        const input: LogicRuleInput = {
            when,
            targetType,
            action,
            targetSectionId: targetType === "section" ? targetId : null,
            targetStepId: targetType === "step" ? targetId : null,
            order: rule?.order,
        };
        onSave(input);
    };

    return (
        <div className="space-y-4 rounded-md border p-3">
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="rule-target-type" className="text-xs">Target type</Label>
                    <Select value={targetType} onValueChange={(v) => handleTargetTypeChange(v as LogicRuleTargetType)}>
                        <SelectTrigger id="rule-target-type" className="h-8 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="section">Section</SelectItem>
                            <SelectItem value="step">Question</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="rule-action" className="text-xs">Action</Label>
                    <Select value={action} onValueChange={(v) => setAction(v as LogicRuleAction)}>
                        <SelectTrigger id="rule-action" className="h-8 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {availableActions.map((a) => (
                                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="rule-target" className="text-xs">
                    {targetType === "section" ? "Target section" : "Target question"}
                    {action === "skip_to" ? " (skip destination)" : ""}
                </Label>
                {targetOptions.length === 0 ? (
                    <Alert>
                        <AlertDescription>
                            {targetType === "section" ? "This workflow has no other sections yet." : "This workflow has no questions yet."}
                        </AlertDescription>
                    </Alert>
                ) : (
                    <Select value={targetId} onValueChange={setTargetId}>
                        <SelectTrigger id="rule-target" className="h-8 text-sm">
                            <SelectValue placeholder={`Choose a ${targetType === "section" ? "section" : "question"}...`} />
                        </SelectTrigger>
                        <SelectContent>
                            {targetOptions.map((opt) => (
                                <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            <Separator />

            <div className="space-y-1.5">
                <Label className="text-xs">Trigger condition</Label>
                <LogicBuilder
                    workflowId={workflowId}
                    elementType={targetType === "section" ? "section" : "step"}
                    value={when}
                    onChange={setWhen}
                />
            </div>

            <Separator />

            <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
                    Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? "Saving..." : rule ? "Save rule" : "Add rule"}
                </Button>
            </div>
        </div>
    );
}
