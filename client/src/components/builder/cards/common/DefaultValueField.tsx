import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useDebouncedFieldMutation } from "@/hooks/useDebouncedFieldMutation";
import { useUpdateStep } from "@/lib/vault-hooks";

export type DefaultValueType = string | boolean | number | null | Record<string, unknown>;

interface DefaultValueFieldProps {
    stepId: string;
    sectionId: string;
    defaultValue: DefaultValueType;
    type: string;
    mode?: 'easy' | 'advanced';
}

export function DefaultValueField({
    stepId,
    sectionId,
    defaultValue,
    type,
    mode = 'easy'
}: DefaultValueFieldProps) {
    const updateStepMutation = useUpdateStep();

    const handleDefaultValueChange = (value: string) => {
        let parsedValue: string | boolean | number | null = value;

        if (type === 'yes_no' || type === 'true_false' || type === 'boolean') {
            parsedValue = value === 'yes' ? true : value === 'no' ? false : null;
        } else if (value === '') {
            parsedValue = null;
        }

        updateStepMutation.mutate({
            id: stepId,
            sectionId,
            defaultValue: parsedValue
        });
    };

    const { localValue: localDefaultValue, onChange: onLocalDefaultValueChange, onBlur: onLocalDefaultValueBlur } = useDebouncedFieldMutation(
        defaultValue === null || defaultValue === undefined || typeof defaultValue === 'object' ? "" : String(defaultValue),
        (value) => handleDefaultValueChange(value)
    );

    if (mode === 'easy') {
        return null;
    }

    const staticInputValue = localDefaultValue;

    const staticSelectValue = (defaultValue === null || defaultValue === undefined || typeof defaultValue === 'object')
        ? "none"
        : defaultValue === true ? "yes" : "no";


    return (
        <div className="space-y-1.5 pt-2">
            <Separator className="mb-2" />
            <Label htmlFor={`default-val-${stepId}`} className="text-xs text-muted-foreground">
                Default Value
            </Label>
            {['yes_no', 'true_false', 'boolean'].includes(type) ? (
                    <Select
                        value={staticSelectValue}
                        onValueChange={(value) => {
                            if (value === "none") {
                                handleDefaultValueChange("");
                            } else {
                                handleDefaultValueChange(value);
                            }
                        }}
                    >
                        <SelectTrigger id={`default-val-${stepId}`} className="h-9">
                            <SelectValue placeholder="No default" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">No default</SelectItem>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                    </Select>
            ) : (
                    <Input
                        id={`default-val-${stepId}`}
                        name={`default-val-${stepId}`}
                        value={staticInputValue}
                        onChange={(e) => onLocalDefaultValueChange(e.target.value)}
                        onBlur={onLocalDefaultValueBlur}
                        placeholder="Enter default value..."
                        className="h-9 text-sm"
                    />
            )}
        </div>
    );
}
