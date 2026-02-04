
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { type ForEachRule, type LegacyValidateRule } from "@shared/types/blocks";

import { VariableInput } from "./VariableInput";

interface ForEachRuleEditorProps {
    rule: ForEachRule;
    onChange: (r: ForEachRule) => void;
    workflowId: string;
}

export function ForEachRuleEditor({ rule, onChange, workflowId }: ForEachRuleEditorProps) {
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-[2fr_1fr] gap-2">
                <VariableInput
                    label="Iterate List"
                    value={rule.listKey}
                    onChange={(v) => onChange({ ...rule, listKey: v })}
                    workflowId={workflowId}
                />
                <div className="space-y-1">
                    <Label className="text-xs">Item Alias</Label>
                    <Input
                        value={rule.itemAlias}
                        onChange={(e) => onChange({ ...rule, itemAlias: e.target.value })}
                        className="h-8 text-xs"
                        placeholder="e.g. item"
                    />
                </div>
            </div>
            <div className="bg-slate-50 p-2 rounded-md border text-xs">
                <div className="font-semibold text-slate-700 mb-2">Item Validations:</div>
                {rule.rules.map((subRule, idx) => (
                    <div key={idx} className="mb-2 pb-2 border-b last:border-0">
                        <div className="flex gap-1 items-center mb-1">
                            {/* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions -- legacy loose types need this check */}
                            <span className="font-mono text-slate-500">{((subRule as any).assert?.key as string) ?? ((subRule as any).left as string) ?? 'Rule'}</span>
                            <Button variant="ghost" size="icon" className="h-4 w-4 ml-auto" onClick={() => {
                                const newSub = [...rule.rules];
                                newSub.splice(idx, 1);
                                onChange({ ...rule, rules: newSub });
                            }}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                        <Input
                            value={subRule.message}
                            onChange={(e) => {
                                const newSub = [...rule.rules];
                                newSub[idx] = { ...subRule, message: e.target.value };
                                onChange({ ...rule, rules: newSub });
                            }}
                            className="h-6 text-[10px]"
                            placeholder="Error message..."
                        />
                    </div>
                ))}
                <Button variant="secondary" size="sm" className="w-full h-6 text-[10px]" onClick={() => {
                    const newSub = [...rule.rules, { assert: { key: `${rule.itemAlias}.field`, op: 'is_not_empty' }, message: 'Required' } as LegacyValidateRule];
                    onChange({ ...rule, rules: newSub });
                }}>
                    + Add Item Check (JSON)
                </Button>
            </div>
        </div>
    );
}
