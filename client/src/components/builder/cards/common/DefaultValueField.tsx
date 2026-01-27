import { Database, Link as LinkIcon } from "lucide-react";
import React, { useState, useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUpdateStep, useWorkflow } from "@/lib/vault-hooks";

import { useIntake } from "../../IntakeContext";

interface DefaultValueFieldProps {
    stepId: string;
    sectionId: string;
    workflowId: string;
    defaultValue: any;
    type: string;
    mode?: 'easy' | 'advanced';
}

export function DefaultValueField({
    stepId,
    sectionId,
    workflowId,
    defaultValue,
    type,
    mode = 'easy'
}: DefaultValueFieldProps) {
    const updateStepMutation = useUpdateStep();
    const { data: workflow } = useWorkflow(workflowId);
    const { upstreamWorkflow, upstreamVariables, upstreamWorkflowId } = useIntake();

    const isLinkedToIntake = !!defaultValue && typeof defaultValue === 'object' && defaultValue.source === 'intake';
    const linkedVariable = isLinkedToIntake ? upstreamVariables.find(v => v.alias === defaultValue.variable) : null;

    // Local state for active tab to allow switching without committing/wiping
    const [activeTab, setActiveTab] = useState(isLinkedToIntake ? "intake" : "static");

    // Sync external state changes (e.g. from undo/redo or other users) to local tab
    // only if the "mode" definitely changed.
    useEffect(() => {
        if (isLinkedToIntake) {
            setActiveTab("intake");
        } else {
            // Keep current tab if not forced specific way, but if defaultValue exists and is not object, maybe static?
        }
    }, [isLinkedToIntake, defaultValue]);

    // Update active tab when user clicks
    const handleTabChange = (val: string) => {
        setActiveTab(val);
        // Requirement: "Only clear intake link when switching from intake→static, and only if currently linked"
        if (val === 'static' && isLinkedToIntake) {
            handleIntakeLinkChange("none");
        }
    };

    // Only show if Advanced Mode OR Intake Linking is available
    if (mode === 'easy' && !upstreamWorkflowId) {
        return null;
    }

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

    const handleIntakeLinkChange = (variableAlias: string) => {
        updateStepMutation.mutate({
            id: stepId,
            sectionId,
            defaultValue: variableAlias === 'none' ? null : { source: 'intake', variable: variableAlias }
        });
    };

    // Determine displayed value for static input
    // If defaultValue is an object (link), don't show it as string in static input
    const staticInputValue = (defaultValue === null || defaultValue === undefined || typeof defaultValue === 'object')
        ? ""
        : String(defaultValue);

    const staticSelectValue = (defaultValue === null || defaultValue === undefined || typeof defaultValue === 'object')
        ? "none"
        : defaultValue === true ? "yes" : "no";


    return (
        <div className="space-y-1.5 pt-2">
            <Separator className="mb-2" />
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Label htmlFor={`default-val-${stepId}`} className="text-xs text-muted-foreground">
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
                                    onChange={(e) => { void handleDefaultValueChange(e.target.value); }}
                                    placeholder="Enter default value..."
                                    className="h-9 text-sm"
                                />
                            )}
                        </TabsContent>

                        <TabsContent value="intake" className="mt-2 text-primary-foreground">
                            <div className="space-y-1">
                                <Label htmlFor={`default-val-intake-${stepId}`} className="sr-only">Select Intake Variable</Label>
                                <Select
                                    value={isLinkedToIntake && defaultValue?.variable ? defaultValue.variable : "none"}
                                    onValueChange={handleIntakeLinkChange}
                                >
                                    <SelectTrigger id={`default-val-intake-${stepId}`} className="h-9 w-full bg-emerald-50/50 border-emerald-200 text-emerald-900 focus:ring-emerald-500">
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
                ['yes_no', 'true_false', 'boolean'].includes(type) ? (
                    <Select
                        value={
                            defaultValue === null || defaultValue === undefined
                                ? "none"
                                : defaultValue === true
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
                        value={
                            defaultValue === null || defaultValue === undefined
                                ? ""
                                : typeof defaultValue === "object"
                                    ? JSON.stringify(defaultValue)
                                    : String(defaultValue)
                        }
                        onChange={(e) => { void handleDefaultValueChange(e.target.value); }}
                        placeholder="Enter default value..."
                        className="h-9 text-sm"
                    />
                )
            )}
        </div>
    );
}
