
import { HelpCircle, ExternalLink } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiStep } from "@/lib/vault-hooks";

interface DefaultValueEditorProps {
    step: ApiStep;
    onChange: (value: string) => void;
}

export function DefaultValueEditor({ step, onChange }: DefaultValueEditorProps) {
    const getDefaultValueString = () => {
        if (step.defaultValue === null || step.defaultValue === undefined) {
            return step.type === "yes_no" || step.type === "true_false" ? "no_default" : "";
        }
        if (typeof step.defaultValue === "object") {
            return JSON.stringify(step.defaultValue);
        }
        return String(step.defaultValue);
    };

    const handleSelectChange = (val: string) => {
        onChange(val);
    };

    const currentVal = getDefaultValueString();

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Label htmlFor="defaultValue">Default Value</Label>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <a
                                href="/docs/url-parameters"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <HelpCircle className="h-4 w-4" />
                            </a>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                            <p className="text-sm">
                                Set a default value that appears when the workflow runs.
                                Can be overridden using URL parameters.
                            </p>
                            <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                                <ExternalLink className="h-3 w-3" />
                                <span>Click for full documentation</span>
                            </div>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            {step.type === "yes_no" || step.type === "true_false" ? (
                <Select
                    value={currentVal}
                    onValueChange={handleSelectChange}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select default..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="no_default">No Default</SelectItem>
                        {step.type === "yes_no" ? (
                            <>
                                <SelectItem value="true">Yes</SelectItem>
                                <SelectItem value="false">No</SelectItem>
                            </>
                        ) : (
                            <>
                                <SelectItem value="true">True</SelectItem>
                                <SelectItem value="false">False</SelectItem>
                            </>
                        )}
                    </SelectContent>
                </Select>
            ) : (
                <>
                    <Input
                        id="defaultValue"
                        value={currentVal === "no_default" ? "" : currentVal}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={
                            step.type === "multiple_choice"
                                ? '["Option 1", "Option 2"]'
                                : step.type === "radio"
                                    ? "Option text"
                                    : step.type === "date_time"
                                        ? "YYYY-MM-DD or YYYY-MM-DDTHH:mm"
                                        : "Enter default value..."
                        }
                    />
                    <p className="text-xs text-muted-foreground">
                        This value will be pre-filled when the workflow runs. Can be overridden by URL parameters.
                    </p>
                </>
            )}
        </div>
    );
}
