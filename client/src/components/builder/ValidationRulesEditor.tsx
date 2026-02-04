import { Code, AlertCircle, List } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Types derived from existing codebase
import type {
    ValidateRule,
    CompareRule,
    ConditionalRequiredRule,
    ForEachRule,
    LegacyValidateRule
} from "@shared/types/blocks";

import { RuleCard } from "./validation/RuleCard";

interface ValidationRulesEditorProps {
    rules: ValidateRule[];
    onChange: (rules: ValidateRule[]) => void;
    workflowId: string;
    mode?: "easy" | "advanced";
}

export function ValidationRulesEditor({ rules, onChange, workflowId, mode = "easy" }: ValidationRulesEditorProps) {
    const [activeTab, setActiveTab] = useState<"visual" | "json">("visual");

    const addRule = (type: string) => {
        let newRule: ValidateRule;
        if (type === 'compare') {
            newRule = {
                type: 'compare',
                left: '',
                op: 'equals',
                right: '',
                rightType: 'constant',
                message: 'Value mismatch'
            } as CompareRule;
        } else if (type === 'conditional_required') {
            newRule = {
                type: 'conditional_required',
                when: { key: '', op: 'equals', value: '' },
                requiredFields: [],
                message: 'This field is required'
            } as ConditionalRequiredRule;
        } else if (type === 'foreach') {
            newRule = {
                type: 'foreach',
                listKey: '',
                itemAlias: 'item',
                rules: [],
                message: 'List item validation failed'
            } as ForEachRule;
        } else {
            newRule = { assert: { key: '', op: 'is_not_empty' }, message: 'Invalid' } as LegacyValidateRule;
        }
        onChange([...rules, newRule]);
    };

    const updateRule = (index: number, updated: ValidateRule) => {
        const newRules = [...rules];
        newRules[index] = updated;
        onChange(newRules);
    };

    const deleteRule = (index: number) => {
        const newRules = [...rules];
        newRules.splice(index, 1);
        onChange(newRules);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label>Validation Rules</Label>
                {mode === 'advanced' && (
                    <div className="flex bg-muted rounded-md p-1">
                        <button
                            onClick={() => setActiveTab("visual")}
                            className={`px-3 py-1 text-xs rounded-sm transition-all ${activeTab === "visual" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                        >
                            Visual
                        </button>
                        <button
                            onClick={() => setActiveTab("json")}
                            className={`px-3 py-1 text-xs rounded-sm transition-all ${activeTab === "json" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                        >
                            JSON
                        </button>
                    </div>
                )}
            </div>
            {activeTab === "json" ? (
                <Textarea
                    value={JSON.stringify(rules, null, 2)}
                    onChange={(e) => {
                        try {
                            onChange(JSON.parse(e.target.value) as ValidateRule[]);
                        } catch {
                            // Ignore parse errors during typing - user may be mid-edit
                            // The textarea will keep showing the invalid JSON until fixed
                        }
                    }}
                    className="font-mono text-xs h-[400px]"
                />
            ) : (
                <div className="space-y-4">
                    {rules.length === 0 && (
                        <div className="text-center py-8 border-2 border-dashed rounded-lg text-muted-foreground text-sm">
                            No validation rules defined.
                        </div>
                    )}
                    {rules.map((rule, index) => (
                        <RuleCard
                            key={index}
                            rule={rule}
                            index={index}
                            onUpdate={(r) => updateRule(index, r)}
                            onDelete={() => deleteRule(index)}
                            workflowId={workflowId}
                        />
                    ))}
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => addRule('compare')} className="gap-1">
                            <Code className="w-3 h-3" /> Compare Values
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => addRule('conditional_required')} className="gap-1">
                            <AlertCircle className="w-3 h-3" /> Conditional Required
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => addRule('foreach')} className="gap-1">
                            <List className="w-3 h-3" /> For Each Loop
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}