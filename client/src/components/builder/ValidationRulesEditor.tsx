import {  Trash2, Code, AlertCircle, List , Database } from "lucide-react";
import React, { useState } from "react";
import { EnhancedVariablePicker } from "@/components/common/EnhancedVariablePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
// Types derived from existing codebase or re-declared for standalone usage if needed
// Assuming @shared/types/blocks is available
import type {
    ValidateRule,
    CompareRule,
    ConditionalRequiredRule,
    ForEachRule,
    LegacyValidateRule
} from "@shared/types/blocks";
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
                            onChange(JSON.parse(e.target.value));
                        } catch (error) {
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
// ... Copy RuleCard and sub-editors from ValidateBlockEditor.tsx ...
// To save space/complexity in this artifact generation, I will assume I can copy-paste them or define them here.
// For now, I'll paste the full content including subcomponents to ensure it works standalone.
function RuleCard({ rule, index, onUpdate, onDelete, workflowId }: {
    rule: ValidateRule,
    index: number,
    onUpdate: (r: ValidateRule) => void,
    onDelete: () => void,
    workflowId: string
}) {
    const type = (rule as any).type || 'simple';
    return (
        <Card className="relative group">
            <div className="absolute top-2 right-2">
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete}>
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
            <CardContent className="p-3 pt-3 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {type.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">Rule #{index + 1}</span>
                </div>
                {type === 'compare' && (
                    <CompareRuleEditor rule={rule as CompareRule} onChange={onUpdate} workflowId={workflowId} />
                )}
                {type === 'conditional_required' && (
                    <ConditionalRequiredRuleEditor rule={rule as ConditionalRequiredRule} onChange={onUpdate} workflowId={workflowId} />
                )}
                {type === 'foreach' && (
                    <ForEachRuleEditor rule={rule as ForEachRule} onChange={onUpdate} workflowId={workflowId} />
                )}
                {(type === 'simple' || !type) && (
                    <div className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
                        Legacy/Advanced Rule (Edit in JSON mode)
                    </div>
                )}
                <div className="pt-2 border-t mt-2">
                    <Label className="text-xs text-muted-foreground">Error Message</Label>
                    <Input
                        value={rule.message}
                        onChange={(e) => onUpdate({ ...rule, message: e.target.value })}
                        className="h-7 text-xs mt-1"
                        placeholder="Error message displayed to user..."
                    />
                </div>
            </CardContent>
        </Card>
    );
}
function CompareRuleEditor({ rule, onChange, workflowId }: { rule: CompareRule, onChange: (r: CompareRule) => void, workflowId: string }) {
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-[1fr_100px_1fr] gap-2 items-end">
                <VariableInput
                    label="Left Side"
                    value={rule.left}
                    onChange={(v) => onChange({ ...rule, left: v })}
                    workflowId={workflowId}
                />
                <div className="space-y-1">
                    <Select value={rule.op} onValueChange={(v: any) => onChange({ ...rule, op: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="equals">=</SelectItem>
                            <SelectItem value="not_equals">!=</SelectItem>
                            <SelectItem value="greater_than">&gt;</SelectItem>
                            <SelectItem value="less_than">&lt;</SelectItem>
                            <SelectItem value="contains">contains</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <div className="flex justify-between items-center">
                        <Label className="text-xs">Right Side</Label>
                        <button
                            className="text-[10px] text-blue-500 hover:underline"
                            onClick={() => onChange({ ...rule, rightType: rule.rightType === 'constant' ? 'variable' : 'constant', right: '' })}
                        >
                            Switch to {rule.rightType === 'constant' ? 'Variable' : 'Constant'}
                        </button>
                    </div>
                    {rule.rightType === 'variable' ? (
                        <VariablePickerInput
                            value={rule.right}
                            onChange={(v) => onChange({ ...rule, right: v })}
                            workflowId={workflowId}
                        />
                    ) : (
                        <Input
                            value={rule.right}
                            onChange={(e) => onChange({ ...rule, right: e.target.value })}
                            className="h-8 text-xs"
                            placeholder="Constant value"
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
function ConditionalRequiredRuleEditor({ rule, onChange, workflowId }: { rule: ConditionalRequiredRule, onChange: (r: ConditionalRequiredRule) => void, workflowId: string }) {
    return (
        <div className="space-y-3">
            <div className="bg-muted/30 p-2 rounded-md space-y-2">
                <Label className="text-xs font-semibold">IF Condition:</Label>
                <div className="flex gap-2">
                    <VariablePickerInput
                        value={rule.when.key}
                        onChange={(v) => onChange({ ...rule, when: { ...rule.when, key: v } })}
                        workflowId={workflowId}
                        placeholder="Variable..."
                    />
                    <Select value={rule.when.op} onValueChange={(v: any) => onChange({ ...rule, when: { ...rule.when, op: v } })}>
                        <SelectTrigger className="w-[80px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="equals">=</SelectItem>
                            <SelectItem value="not_equals">!=</SelectItem>
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
                            <VariablePickerInput
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
function ForEachRuleEditor({ rule, onChange, workflowId }: { rule: ForEachRule, onChange: (r: ForEachRule) => void, workflowId: string }) {
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
                            <span className="font-mono text-slate-500">{(subRule as any).assert?.key || (subRule as any).left || 'Rule'}</span>
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
                    const newSub = [...rule.rules, { assert: { key: `${rule.itemAlias  }.field`, op: 'is_not_empty' }, message: 'Required' } as LegacyValidateRule];
                    onChange({ ...rule, rules: newSub });
                }}>
                    + Add Item Check (JSON)
                </Button>
            </div>
        </div>
    );
}
interface VariableInputProps {
    label?: string;
    value: any;
    onChange: (value: string) => void;
    workflowId: string;
    placeholder?: string;
}
function VariableInput({ label, value, onChange, workflowId, placeholder }: VariableInputProps) {
    return (
        <div className="space-y-1">
            {label && <Label className="text-xs">{label}</Label>}
            <VariablePickerInput
                value={value}
                onChange={onChange}
                workflowId={workflowId}
                placeholder={placeholder}
            />
        </div>
    );
}
function VariablePickerInput({ value, onChange, workflowId, placeholder }: VariableInputProps) {
    return (
        <div className="relative flex items-center">
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 text-xs pr-8 font-mono"
                placeholder={placeholder || "Variable..."}
            />
            <div className="absolute right-1 top-1">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                            <Database className="h-3 w-3 text-muted-foreground" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] h-[300px] p-0" align="end">
                        <EnhancedVariablePicker
                            workflowId={workflowId}
                            onInsert={(v) => onChange(v)}
                        />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}