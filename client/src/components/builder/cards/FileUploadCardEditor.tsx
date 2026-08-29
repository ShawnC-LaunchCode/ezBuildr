import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useUpdateStep } from "@/lib/vault-hooks";
import { AliasField } from "./common/AliasField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";
import type { StepEditorCommonProps } from "./common/stepEditorProps";
import type { ConditionExpression } from "@shared/types/conditions";
import type { z } from "zod";
import type { FileUploadConfigSchema } from "@shared/validation/stepConfigSchemas";

type FileUploadConfig = NonNullable<z.infer<typeof FileUploadConfigSchema>>;

export function FileUploadCardEditor({ stepId, pageId, workflowId, step }: StepEditorCommonProps): JSX.Element {
    const updateStepMutation = useUpdateStep();
    const config = (step.config ?? {}) as FileUploadConfig;

    const handleConfigChange = (updates: Partial<FileUploadConfig>) => {
        updateStepMutation.mutate({
            id: stepId,
            pageId,
            config: { ...config, ...updates },
        });
    };

    return (
        <div className="space-y-4 p-4 border-t bg-muted/30">
            <AliasField value={step.alias} onChange={(alias) => updateStepMutation.mutate({ id: stepId, pageId, alias })} workflowId={workflowId} currentStepId={stepId} />
            <RequiredToggle checked={step.required} onChange={(required) => updateStepMutation.mutate({ id: stepId, pageId, required })} />
            <Separator />
            
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Image Previews</Label>
                        <p className="text-xs text-muted-foreground">
                            Show previews for uploaded image files
                        </p>
                    </div>
                    <Switch
                        checked={config.previewThumbnails === true}
                        onCheckedChange={(checked) => handleConfigChange({ previewThumbnails: checked })}
                    />
                </div>
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Max Files</Label>
                    <Input
                        type="number"
                        min={1}
                        max={10}
                        value={config.maxFiles ?? 1}
                        onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val)) {
                                handleConfigChange({ maxFiles: val });
                            }
                        }}
                    />
                    <p className="text-xs text-muted-foreground">
                        Maximum number of files allowed (1-10)
                    </p>
                </div>
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Max Size (MB)</Label>
                    <Input
                        type="number"
                        min={1}
                        value={config.maxSize ? Math.round(config.maxSize / (1024 * 1024)) : ''}
                        onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            handleConfigChange({ maxSize: isNaN(val) ? undefined : val * 1024 * 1024 });
                        }}
                    />
                    <p className="text-xs text-muted-foreground">
                        Maximum file size in megabytes
                    </p>
                </div>
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Allowed Types</Label>
                    <Input
                        type="text"
                        value={(config.allowedTypes ?? []).join(', ')}
                        placeholder="e.g., image/jpeg, application/pdf"
                        onChange={(e) => {
                            const val = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                            handleConfigChange({ allowedTypes: val.length > 0 ? val : undefined });
                        }}
                    />
                    <p className="text-xs text-muted-foreground">
                        Comma-separated list of allowed MIME types or extensions
                    </p>
                </div>
            </div>

            {workflowId && (
                <>
                    <Separator />
                    <VisibilityField
                        stepId={stepId}
                        pageId={pageId}
                        workflowId={workflowId}
                        visibleIf={step.visibleIf as ConditionExpression}
                    />
                </>
            )}
        </div>
    );
}
