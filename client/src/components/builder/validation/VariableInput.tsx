
import { Database } from "lucide-react";

import { EnhancedVariablePicker } from "@/components/common/EnhancedVariablePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface VariableInputProps {
    label?: string;
    value: string;
    onChange: (value: string) => void;
    workflowId: string;
    placeholder?: string;
}

export function VariableInput({ label, value, onChange, workflowId, placeholder }: VariableInputProps) {
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

function VariablePickerInput({ value, onChange, workflowId, placeholder }: { value: string; onChange: (v: string) => void; workflowId: string; placeholder?: string }) {
    return (
        <div className="relative flex items-center">
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-8 text-xs pr-8 font-mono"
                placeholder={placeholder ?? "Variable..."}
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
