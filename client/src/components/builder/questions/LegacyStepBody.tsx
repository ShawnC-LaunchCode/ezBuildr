import {
    HelpCircle,
    Database,
    Link as LinkIcon,
    EyeOff,
    ChevronDown,
    ChevronRight,
    X,
} from "lucide-react";
import React, { useState, useEffect } from "react";

import { LogicBuilder, LogicStatusText } from "@/components/logic";
import { AutoExpandTextarea } from "@/components/ui/auto-expand-textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ApiStep, StepType } from "@/lib/vault-api";
import {
    useUpdateStep,
    useWorkflow,
    useWorkflowMode
} from "@/lib/vault-hooks";

import type { ConditionExpression } from "@shared/types/conditions";

import { useIntake } from "../IntakeContext";

import { JSQuestionEditor, type JSQuestionConfig } from "./JSQuestionEditor";
import { OptionsEditor, type OptionItemData } from "./OptionsEditor";

interface LegacyStepBodyProps {
    step: ApiStep;
    sectionId: string;
    workflowId: string;
}

export function LegacyStepBody({ step, sectionId, workflowId }: LegacyStepBodyProps) {
    const updateStepMutation = useUpdateStep();
    const { toast } = useToast();
    const { data: modeData } = useWorkflowMode(workflowId);
    const mode = modeData?.mode || 'easy';
    const { data: workflow } = useWorkflow(workflowId);
    const { upstreamWorkflow, upstreamVariables, upstreamWorkflowId } = useIntake();

    // Intake Derived Values
    const isLinkedToIntake = !!step.defaultValue && typeof step.defaultValue === 'object' && step.defaultValue.source === 'intake';

    // Local State
    const [localRequired, setLocalRequired] = useState(step.required || false);
    const [localType, setLocalType] = useState<StepType>(step.type);
    const [isVisibilityOpen, setIsVisibilityOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(isLinkedToIntake ? "intake" : "static");

    const [localOptions, setLocalOptions] = useState<OptionItemData[]>(() => {
        if (step.type === "radio" || step.type === "multiple_choice") {
            const opts = step.options?.options || [];
            return opts.map((opt: any, idx: number) => {
                if (typeof opt === 'string') {
                    return {
                        id: `opt-${Date.now()}-${idx}`,
                        label: opt,
                        alias: opt.toLowerCase().replace(/\s+/g, '_')
                    };
                }
                return opt;
            });
        }
        return [];
    });

    const [localJsConfig, setLocalJsConfig] = useState<JSQuestionConfig>(
        step.type === "js_question" && step.options
            ? (step.options as JSQuestionConfig)
            : {
                display: "hidden",
                code: "return input;",
                inputKeys: [],
                outputKey: "computed_value",
                timeoutMs: 1000,
                helpText: "",
            }
    );

    // Sync state when step prop changes
    useEffect(() => {
        setLocalRequired(step.required || false);
        setLocalType(step.type);
        if (step.type === "radio" || step.type === "multiple_choice") {
            const opts = step.options?.options || [];
            setLocalOptions(opts.map((opt: any, idx: number) => {
                if (typeof opt === 'string') {
                    return {
                        id: `opt-${Date.now()}-${idx}`,
                        label: opt,
                        alias: opt.toLowerCase().replace(/\s+/g, '_')
                    };
                }
                return opt;
            }));
        }

        // Sync activeTab if we become linked
        if (isLinkedToIntake) {
            setActiveTab("intake");
        }
    }, [step, isLinkedToIntake]);

    // Handlers
    const handleTabChange = (val: string) => {
        setActiveTab(val);
        // Requirement: "Only clear intake link when switching from intake→static, and only if currently linked"
        if (val === 'static' && isLinkedToIntake) {
            handleIntakeLinkChange("none");
        }
    };

    const handleAliasChange = (value: string) => {
        updateStepMutation.mutate(
            { id: step.id, sectionId, alias: value.trim() || null },
            {
                onError: (error: any) => {
                    toast({
                        title: "Error",
                        description: error?.message || "Failed to update variable name",
                        variant: "destructive",
                    });
                },
            }
        );
    };

    const handleRequiredChange = (required: boolean) => {
        setLocalRequired(required);
        updateStepMutation.mutate({ id: step.id, sectionId, required });
    };

    const handleDescriptionChange = (value: string) => {
        updateStepMutation.mutate({ id: step.id, sectionId, description: value });
    };

    const handleDefaultValueChange = (value: string) => {
        let parsedValue: string | boolean | number | null = value;

        if (step.type === 'yes_no') {
            parsedValue = value === 'yes' ? true : value === 'no' ? false : null;
        } else if (value === '') {
            parsedValue = null;
        }

        updateStepMutation.mutate({
            id: step.id,
            sectionId,
            defaultValue: parsedValue
        });
    };

    const handleIntakeLinkChange = (variableAlias: string) => {
        updateStepMutation.mutate({
            id: step.id,
            sectionId,
            defaultValue: variableAlias === 'none' ? null : { source: 'intake', variable: variableAlias }
        });
    };

    const handleOptionsChange = (options: OptionItemData[] | import("@/../../shared/types/stepConfigs").DynamicOptionsConfig) => {
        if (Array.isArray(options)) {
            setLocalOptions(options);
            updateStepMutation.mutate({
                id: step.id,
                sectionId,
                options: { options },
            });
        } else {
            if (options.type === 'static') {
                setLocalOptions(options.options);
                updateStepMutation.mutate({
                    id: step.id,
                    sectionId,
                    options: { options: options.options },
                });
            } else {
                console.warn('[QuestionCard] Dynamic options not supported for legacy radio/multiple_choice types');
            }
        }
    };

    const handleJsConfigChange = (config: JSQuestionConfig) => {
        setLocalJsConfig(config);
        updateStepMutation.mutate({
            id: step.id,
            sectionId,
            options: config,
        });
    };

    const handleVisibilityChange = (expression: ConditionExpression) => {
        updateStepMutation.mutate(
            {
                id: step.id,
                sectionId,
                visibleIf: expression,
            },
            {
                onSuccess: () => {
                    toast({
                        title: "Visibility updated",
                        description: "Question visibility conditions have been saved.",
                    });
                },
                onError: (error) => {
                    toast({
                        title: "Error",
                        description:
                            error instanceof Error
                                ? error.message
                                : "Failed to save visibility conditions",
                        variant: "destructive",
                    });
                },
            }
        );
    };

    // Determine displayed values for static inputs
    const staticInputValue = (step.defaultValue === null || step.defaultValue === undefined || typeof step.defaultValue === 'object')
        ? ""
        : String(step.defaultValue);

    const staticSelectValue = (step.defaultValue === null || step.defaultValue === undefined || typeof step.defaultValue === 'object')
        ? "none"
        : step.defaultValue === true ? "yes" : "no";

    return (
        <div className="space-y-3 pt-1 border-t">
            {/* Alias / Save Answer As */}
            {step.type !== "display" && (
                <div className={cn(
                    "space-y-1.5 p-2 rounded-md transition-colors",
                    mode === 'easy' && !step.alias && "bg-amber-50/50 border border-amber-200/50"
                )}>
                    <div className="flex items-center justify-between">
                        <Label htmlFor={`alias-${step.id}`} className="text-xs font-medium text-foreground">
                            {mode === 'easy' ? "Save answer as" : "Variable (alias)"}
                        </Label>
                        {mode === 'advanced' && (
                            <span className="text-xs text-muted-foreground">
                                Internal key: <code className="font-mono text-[10px]">{step.id.slice(0, 8)}...</code>
                            </span>
                        )}
                    </div>
                    <Input
                        id={`alias-${step.id}`}
                        name={`alias-${step.id}`}
                        value={step.alias || ""}
                        onChange={(e) => { void handleAliasChange(e.target.value); }}
                        placeholder={mode === 'easy' ? "e.g. clientName or client.name" : "e.g., user_email, phone_number"}
                        className={cn(
                            "h-9 text-sm font-mono",
                            mode === 'easy' && !step.alias && "border-amber-300 focus-visible:ring-amber-400"
                        )}
                    />
                    {mode === 'easy' && (
                        <div className="animate-in fade-in slide-in-from-top-1 space-y-1">
                            {!step.alias ? (
                                <p className="text-[10px] text-amber-600 flex items-center gap-1">
                                    <HelpCircle className="h-3 w-3" />
                                    Used later to fill documents and make decisions.
                                </p>
                            ) : (
                                !/^[a-zA-Z0-9_.]+$/.test(step.alias) && (
                                    <p className="text-[10px] text-amber-600 flex items-center gap-1">
                                        ⚠️ Simple names are safest (a-z, 0-9, dots).
                                    </p>
                                )
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Answer Settings */}
            <div className="space-y-1.5 pt-2">

                {/* Required Toggle */}
                {step.type !== "display" && (
                    <div className="flex items-center justify-between py-1">
                        <Label htmlFor={`required-${step.id}`} className="text-sm cursor-pointer">
                            Required
                        </Label>
                        <Switch
                            id={`required-${step.id}`}
                            checked={localRequired}
                            onCheckedChange={handleRequiredChange}
                        />
                    </div>
                )}

                {/* Description / Help Text */}
                <div className="space-y-1.5">
                    <Label htmlFor={`description-${step.id}`} className="text-xs text-muted-foreground">
                        {step.type === "display" ? "Content (Markdown)" : "Description / Help Text (optional)"}
                    </Label>
                    <AutoExpandTextarea
                        id={`description-${step.id}`}
                        name={`description-${step.id}`}
                        value={step.description || ""}
                        onChange={(e) => { void handleDescriptionChange(e.target.value); }}
                        placeholder={step.type === "display" ? "Enter markdown content..." : "Add instructions for the user..."}
                        minRows={step.type === "display" ? 6 : 1}
                        maxRows={step.type === "display" ? 12 : 4}
                        className="text-sm"
                    />
                </div>

                {/* Options Editor (for radio/multiple_choice) */}
                {(localType === "radio" || localType === "multiple_choice") && (
                    <OptionsEditor
                        options={localOptions}
                        onChange={(opts) => { void handleOptionsChange(opts); }}
                        elementId={step.id}
                    />
                )}

                {/* Default Value Section */}
                {step.type !== "display" && (mode === 'advanced' || upstreamWorkflowId) && (
                    <div className="space-y-1.5 pt-2 border-t border-dashed">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Label htmlFor={`default-val-${step.id}`} className="text-xs text-muted-foreground">
                                    Default Value {mode === 'easy' && !upstreamWorkflowId && '(Advanced)'}
                                </Label>
                                {isLinkedToIntake && (
                                    <Badge variant="outline" className="text-[10px] h-4 px-1 gap-1 text-emerald-600 border-emerald-200 bg-emerald-50">
                                        <LinkIcon className="w-2.5 h-2.5" />
                                        Linked
                                    </Badge>
                                )}
                            </div>
                        </div>

                        {upstreamWorkflowId ? (
                            <div className="space-y-2">
                                {/* Toggle: Static vs Intake */}
                                <Tabs
                                    value={activeTab}
                                    onValueChange={handleTabChange}
                                    className="w-full"
                                >
                                    <TabsList className="grid w-full grid-cols-2 h-7">
                                        <TabsTrigger value="static" className="text-xs h-6">Static Value</TabsTrigger>
                                        <TabsTrigger value="intake" className="text-xs h-6 flex items-center gap-1">
                                            <Database className="w-3 h-3" /> From Intake
                                        </TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="static" className="mt-2 space-y-1.5">
                                        {step.type === "yes_no" ? (
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
                                                <SelectTrigger id={`default-val-${step.id}`} className="h-9">
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
                                                id={`default-val-${step.id}`}
                                                name={`default-val-${step.id}`}
                                                value={staticInputValue}
                                                onChange={(e) => { void handleDefaultValueChange(e.target.value); }}
                                                placeholder="Enter default value..."
                                                className="h-9 text-sm"
                                            />
                                        )}
                                    </TabsContent>

                                    <TabsContent value="intake" className="mt-2 text-primary-foreground">
                                        <div className="space-y-1">
                                            <Label htmlFor={`default-val-intake-${step.id}`} className="sr-only">Select Intake Variable</Label>
                                            <Select
                                                value={isLinkedToIntake && step.defaultValue?.variable ? step.defaultValue.variable : "none"}
                                                onValueChange={handleIntakeLinkChange}
                                            >
                                                <SelectTrigger id={`default-val-intake-${step.id}`} className="h-9 w-full bg-emerald-50/50 border-emerald-200 text-emerald-900 focus:ring-emerald-500">
                                                    <SelectValue placeholder="Select intake variable..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">-- Select Variable --</SelectItem>
                                                    {upstreamVariables.map(v => (
                                                        <SelectItem key={v.key} value={v.alias || v.key}>
                                                            <div className="flex flex-col text-left">
                                                                <span className="font-medium text-sm">{v.label}</span>
                                                                <span className="text-[10px] text-muted-foreground font-mono">{v.alias || v.key}</span>
                                                            </div>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {isLinkedToIntake && (
                                                <p className="text-[10px] text-emerald-600 pl-1">
                                                    This field will pre-fill from <strong>{upstreamWorkflow?.title}</strong> data.
                                                    <span className="sr-only">Input linked to intake variable.</span>
                                                </p>
                                            )}
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </div>
                        ) : (
                            // Standard Static Default Value (No Upstream)
                            step.type === "yes_no" ? (
                                <Select
                                    value={
                                        step.defaultValue === null || step.defaultValue === undefined
                                            ? "none"
                                            : step.defaultValue === true
                                                ? "yes"
                                                : "no"
                                    }
                                    onValueChange={(value) => {
                                        if (value === "none") {
                                            handleDefaultValueChange("");
                                        } else {
                                            handleDefaultValueChange(value);
                                        }
                                    }}
                                >
                                    <SelectTrigger id={`default-val-${step.id}`} className="h-9">
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
                                    id={`default-val-${step.id}`}
                                    name={`default-val-${step.id}`}
                                    value={
                                        step.defaultValue === null || step.defaultValue === undefined
                                            ? ""
                                            : typeof step.defaultValue === "object"
                                                ? JSON.stringify(step.defaultValue)
                                                : String(step.defaultValue)
                                    }
                                    onChange={(e) => { void handleDefaultValueChange(e.target.value); }}
                                    placeholder="Enter default value..."
                                    className="h-9 text-sm"
                                />
                            )
                        )}
                    </div>
                )}

                {/* JS Question Editor (for js_question) */}
                {localType === "js_question" && (
                    <JSQuestionEditor
                        config={localJsConfig}
                        onChange={(config) => { void handleJsConfigChange(config); }}
                        elementId={step.id}
                        workflowId={workflowId}
                    />
                )}

                {/* Visibility Logic Section - Advanced Mode Only */}
                {mode === 'advanced' && (
                    <Collapsible
                        open={isVisibilityOpen}
                        onOpenChange={setIsVisibilityOpen}
                        className="border rounded-md"
                    >
                        <CollapsibleTrigger asChild>
                            <Button
                                variant="ghost"
                                className="w-full justify-between px-3 py-2 h-auto"
                            >
                                <div className="flex items-center gap-2">
                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">Visibility</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <LogicStatusText visibleIf={step.visibleIf} />
                                    {isVisibilityOpen ? (
                                        <ChevronDown className="h-4 w-4" />
                                    ) : (
                                        <ChevronRight className="h-4 w-4" />
                                    )}
                                </div>
                            </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-3 pb-3">
                            <LogicBuilder
                                workflowId={workflowId}
                                elementId={step.id}
                                elementType="step"
                                value={(step.visibleIf as ConditionExpression) || null}
                                onChange={(expression) => { void handleVisibilityChange(expression); }}
                                isSaving={updateStepMutation.isPending}
                            />
                        </CollapsibleContent>
                    </Collapsible>
                )}
            </div>
        </div>
    );
}
