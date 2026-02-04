
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { type ConditionalRequiredRule } from "@shared/types/blocks";

import { VariableInput } from "./VariableInput";

interface ConditionalRequiredRuleEditorProps {
    rule: ConditionalRequiredRule;
    onChange: (r: ConditionalRequiredRule) => void;
    workflowId: string;
}

export function ConditionalRequiredRuleEditor({ rule, onChange, workflowId }: ConditionalRequiredRuleEditorProps) {
    return (
        <div className="space-y-3">
            <div className="bg-muted/30 p-2 rounded-md space-y-2">
                <Label className="text-xs font-semibold">IF Condition:</Label>
                <div className="flex gap-2">
                    <VariableInput
                        value={rule.when.key}
                        onChange={(v) => onChange({ ...rule, when: { ...rule.when, key: v } })}
                        workflowId={workflowId}
                        placeholder="Variable..."
                    />
                    <Select value={rule.when.op} onValueChange={(v: string) => onChange({ ...rule, when: { ...rule.when, op: v as 'equals' | 'not_equals' | 'contains' } })}>
                        <SelectTrigger className="w-[80px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="equals">=</SelectItem>
                            <SelectItem value="not_equals">!=</SelectItem>
                            <SelectItem value="contains">contains</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        value={rule.when.value}
                        onChange={(e) => onChange({ ...rule, when: { ...rule.when, value: e.target.value } })}
                        className="h-8 text-xs flex-1"
                        placeholder="Value..."
                    />
                </div>
            </div>
            <div className="space-y-1">
                <Label className="text-xs font-semibold">THEN Require Fields:</Label>
                <div className="space-y-1">
                    {rule.requiredFields.map((field, idx) => (
                        <div key={idx} className="flex gap-1">
                            <VariableInput
                                value={field}
                                onChange={(v) => {
                                    const newFields = [...rule.requiredFields];
                                    newFields[idx] = v;
                                    onChange({ ...rule, requiredFields: newFields });
                                }}
                                workflowId={workflowId}
                                placeholder="Select field to require..."
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                const newFields = [...rule.requiredFields];
                                newFields.splice(idx, 1);
                                onChange({ ...rule, requiredFields: newFields });
                            }}>
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    ))}
                    <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => onChange({ ...rule, requiredFields: [...rule.requiredFields, ''] })}>
                        + Add Response to Require
                    </Button>
                </div>
            </div>
        </div>
    );
}
