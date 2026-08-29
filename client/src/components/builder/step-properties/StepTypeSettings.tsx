
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { ApiStep } from "@/lib/vault-hooks";

type DateTimeType = "date" | "time" | "datetime";
type TextType = "short" | "long";

interface StepTypeSettingsProps {
    step: ApiStep;
    textType: TextType;
    dateTimeType: DateTimeType;
    onTextTypeChange: (type: TextType) => void;
    onDateTimeTypeChange: (type: DateTimeType) => void;
}

export function StepTypeSettings({
    step,
    textType,
    dateTimeType,
    onTextTypeChange,
    onDateTimeTypeChange,
}: StepTypeSettingsProps) {
    if (step.type === "short_text" || step.type === "long_text") {
        return (
            <>
                <Separator />
                <div className="space-y-3">
                    <Label>Input Type</Label>
                    <RadioGroup value={textType} onValueChange={(v) => onTextTypeChange(v as TextType)}>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="short" id="text-short" />
                            <Label htmlFor="text-short" className="font-normal cursor-pointer">
                                Short Text (Single line)
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="long" id="text-long" />
                            <Label htmlFor="text-long" className="font-normal cursor-pointer">
                                Long Text (Multi-line)
                            </Label>
                        </div>
                    </RadioGroup>
                </div>
            </>
        );
    }

    if (["date", "time", "date_time", "datetime", "datetime_unified"].includes(step.type)) {
        return (
            <>
                <Separator />
                <div className="space-y-3">
                    <Label>Date/Time Type</Label>
                    <RadioGroup value={dateTimeType} onValueChange={(v) => onDateTimeTypeChange(v as DateTimeType)}>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="date" id="dt-date" />
                            <Label htmlFor="dt-date" className="font-normal cursor-pointer">
                                Date Only
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="time" id="dt-time" />
                            <Label htmlFor="dt-time" className="font-normal cursor-pointer">
                                Time Only
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="datetime" id="dt-datetime" />
                            <Label htmlFor="dt-datetime" className="font-normal cursor-pointer">
                                Date and Time
                            </Label>
                        </div>
                    </RadioGroup>
                </div>
            </>
        );
    }

    return null;
}
