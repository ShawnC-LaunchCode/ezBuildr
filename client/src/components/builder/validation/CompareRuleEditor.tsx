
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { type CompareRule } from "@shared/types/blocks";

import { VariableInput } from "./VariableInput";

interface CompareRuleEditorProps {
    rule: CompareRule;
    onChange: (r: CompareRule) => void;
    workflowId: string;
}

export function CompareRuleEditor({ rule, onChange, workflowId }: CompareRuleEditorProps) {
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
                    <Select value={rule.op} onValueChange={(v: string) => onChange({ ...rule, op: v as CompareRule['op'] })}>
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
                        <VariableInput
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                            value={rule.right}
                            onChange={(v) => onChange({ ...rule, right: v })}
                            workflowId={workflowId}
                        />
                    ) : (
                        <Input
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
