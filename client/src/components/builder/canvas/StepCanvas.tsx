
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateStep, type ApiStep } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

import { SimpleOptionsEditor } from "./SimpleOptionsEditor";

export function StepCanvas({ step, sectionId }: { step: ApiStep; sectionId: string }) {
    const { mode } = useWorkflowBuilder();
    const updateMutation = useUpdateStep();

    const handleUpdate = (field: keyof ApiStep, value: unknown) => {
        updateMutation.mutate({ id: step.id, sectionId, [field]: value });
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <Card>
                <CardHeader>
                    <CardTitle>Step Settings</CardTitle>
                    <CardDescription>Configure this step&apos;s properties and behavior</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Title */}
                    <div className="space-y-2">
                        <Label htmlFor="step-title">Label *</Label>
                        <Input
                            id="step-title"
                            value={step.title}
                            onChange={(e) => { handleUpdate("title", e.target.value); }}
                            autoFocus
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <Label htmlFor="step-description">Description</Label>
                        <Textarea
                            id="step-description"
                            value={step.description ?? ""}
                            onChange={(e) => { handleUpdate("description", e.target.value); }}
                            rows={3}
                            placeholder="Help text shown to participants..."
                        />
                    </div>

                    {/* Variable Alias */}
                    <div className="space-y-2">
                        <Label htmlFor="step-alias">Variable (alias)</Label>
                        <Input
                            id="step-alias"
                            value={step.alias ?? ""}
                            onChange={(e) => { handleUpdate("alias", e.target.value ?? null); }}
                            placeholder="e.g., firstName, age, department"
                            className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                            Optional: A human-friendly name to reference this step&apos;s answer in logic and blocks
                        </p>
                    </div>

                    {/* Type */}
                    <div className="space-y-2">
                        <Label htmlFor="step-type">Input Type</Label>
                        <Select value={step.type} onValueChange={(v) => { handleUpdate("type", v); }}>
                            <SelectTrigger id="step-type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="short_text">Short Text</SelectItem>
                                <SelectItem value="long_text">Long Text</SelectItem>
                                <SelectItem value="radio">Radio (Single Choice)</SelectItem>
                                <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                                <SelectItem value="yes_no">Yes/No</SelectItem>
                                <SelectItem value="date_time">Date/Time</SelectItem>
                                <SelectItem value="file_upload">File Upload</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Required */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="step-required">Required</Label>
                            <p className="text-sm text-muted-foreground">
                                Participants must provide an answer
                            </p>
                        </div>
                        <Switch
                            id="step-required"
                            checked={step.required}
                            onCheckedChange={(v) => { handleUpdate("required", v); }}
                        />
                    </div>

                    {/* Options for choice types */}
                    {(step.type === "radio" || step.type === "multiple_choice") && (
                        <div className="space-y-2">
                            <Label>Options</Label>
                            <SimpleOptionsEditor
                                options={Array.isArray(step.config?.options) ? (step.config?.options as string[]) : []}
                                onChange={(opts) => { handleUpdate("config", { ...step.config, options: opts }); }}
                            />
                        </div>
                    )}

                    {/* Advanced Mode Fields */}
                    {mode === "advanced" && (
                        <div className="pt-4 border-t space-y-4">
                            <h4 className="font-medium text-sm">Advanced</h4>
                            <div className="space-y-2">
                                <Label htmlFor="step-key" className="text-xs">
                                    Variable Key (for formulas/logic)
                                </Label>
                                <Input
                                    id="step-key"
                                    value={step.id}
                                    disabled
                                    className="text-xs font-mono"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Use this ID in block configs to reference this step&apos;s value
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
