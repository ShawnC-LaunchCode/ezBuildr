import React, { useState, useEffect } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { ApiStep } from "@/lib/vault-api";
import { useUpdateStep } from "@/lib/vault-hooks";


import { AliasField } from "./common/AliasField";
import { SectionHeader } from "./common/EditorField";
import { RequiredToggle } from "./common/RequiredToggle";
import { VisibilityField } from "./common/VisibilityField";

import type { MultiFieldConfig } from "@/../../shared/types/stepConfigs";

// Local Props
interface MultiFieldCardEditorProps {
  stepId: string;
  sectionId: string;
  workflowId: string;
  step: ApiStep;
}

// Layout presets
// eslint-disable-next-line @typescript-eslint/naming-convention
const LAYOUT_PRESETS: Record<string, MultiFieldConfig['fields']> = {
  "first_last": [
    { key: "first", label: "First Name", type: "text", required: true },
    { key: "last", label: "Last Name", type: "text", required: true },
  ],
  "contact": [
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "phone", required: false },
  ],
  "date_range": [
    { key: "start", label: "Start Date", type: "date", required: true },
    { key: "end", label: "End Date", type: "date", required: true },
  ],
};

const LayoutSelectionSection = ({
  layout,
  onLayoutChange
}: {
  layout: string;
  onLayoutChange: (val: "first_last" | "contact" | "date_range") => void;
}) => (
  <div className="space-y-3">
    <SectionHeader
      title="Layout Type"
      description="Choose the type of multi-field layout"
    />
    <RadioGroup
      value={layout}
      onValueChange={(v) => onLayoutChange(v as "first_last" | "contact" | "date_range")}
    >
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="first_last" id="layout-first-last" />
        <Label htmlFor="layout-first-last" className="cursor-pointer">
          First & Last Name
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="contact" id="layout-contact" />
        <Label htmlFor="layout-contact" className="cursor-pointer">
          Contact (Email + Phone)
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="date_range" id="layout-date-range" />
        <Label htmlFor="layout-date-range" className="cursor-pointer">
          Date Range (Start + End)
        </Label>
      </div>
    </RadioGroup>
  </div>
);

const FieldConfigSection = ({
  fields,
  onFieldLabelChange,
  onFieldRequiredChange
}: {
  fields: MultiFieldConfig['fields'];
  onFieldLabelChange: (index: number, label: string) => void;
  onFieldRequiredChange: (index: number, req: boolean) => void;
}) => (
  <div className="space-y-3">
    <SectionHeader
      title="Fields"
      description="Configure the sub-fields"
    />

    <div className="space-y-3">
      {fields.map((field, index) => (
        <div key={field.key} className="p-3 border rounded-md bg-background space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground w-16">{field.key}</span>
            <Input
              value={field.label}
              onChange={(e) => onFieldLabelChange(index, e.target.value)}
              placeholder="Field label"
              className="text-sm flex-1"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Type: <span className="font-mono">{field.type}</span>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor={`field-required-${index}`} className="text-xs">
                Required
              </Label>
              <Switch
                id={`field-required-${index}`}
                checked={field.required}
                onCheckedChange={(checked) => onFieldRequiredChange(index, checked)}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const StorageModeSection = ({
  storeAs,
  onStoreAsChange
}: {
  storeAs: string;
  onStoreAsChange: (val: "separate" | "combined") => void;
}) => (
  <div className="space-y-3">
    <SectionHeader
      title="Storage Mode"
      description="How the data is stored"
    />
    <RadioGroup
      value={storeAs}
      onValueChange={(v) => onStoreAsChange(v as "separate" | "combined")}
    >
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="separate" id="store-separate" />
        <Label htmlFor="store-separate" className="cursor-pointer">
          Separate variables (e.g., <code className="font-mono text-xs">firstName</code>, <code className="font-mono text-xs">lastName</code>)
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="combined" id="store-combined" />
        <Label htmlFor="store-combined" className="cursor-pointer">
          Combined object (e.g., <code className="font-mono text-xs">{`{first: "John", last: "Doe"}`}</code>)
        </Label>
      </div>
    </RadioGroup>
  </div>
);

export function MultiFieldCardEditor({ stepId, sectionId, workflowId, step }: MultiFieldCardEditorProps) {
  const updateStepMutation = useUpdateStep();

  // Parse config
  const config = step.config as MultiFieldConfig | undefined;

  const [localConfig, setLocalConfig] = useState<MultiFieldConfig>({
    layout: (config?.layout ?? "first_last"),
    fields: config?.fields ?? LAYOUT_PRESETS["first_last"],
    storeAs: (config?.storeAs ?? "separate"),
  });

  useEffect(() => {
    const currentConfig = step.config as MultiFieldConfig | undefined;
    setLocalConfig({
      layout: (currentConfig?.layout ?? "first_last"),
      fields: currentConfig?.fields ?? LAYOUT_PRESETS["first_last"],
      storeAs: (currentConfig?.storeAs ?? "separate"),
    });
  }, [step.config]);

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    const configToSave: MultiFieldConfig = {
      layout: newConfig.layout,
      fields: newConfig.fields,
      storeAs: newConfig.storeAs,
    };

    updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
  };

  const handleLayoutChange = (layout: "first_last" | "contact" | "date_range") => {
    const newFields = LAYOUT_PRESETS[layout];
    handleUpdate({ layout, fields: newFields });
  };

  const handleFieldLabelChange = (index: number, label: string) => {
    const newFields = localConfig.fields.map((f, i) => i === index ? { ...f, label } : f);
    handleUpdate({ fields: newFields });
  };

  const handleFieldRequiredChange = (index: number, required: boolean) => {
    const newFields = localConfig.fields.map((f, i) => i === index ? { ...f, required } : f);
    handleUpdate({ fields: newFields });
  };

  const handleAliasChange = (alias: string | null) => {
    updateStepMutation.mutate({ id: stepId, sectionId, alias });
  };

  const handleRequiredChange = (required: boolean) => {
    updateStepMutation.mutate({ id: stepId, sectionId, required });
  };

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      {/* Alias */}
      <AliasField value={step.alias} onChange={handleAliasChange} />

      {/* Required Toggle */}
      <RequiredToggle checked={step.required} onChange={handleRequiredChange} />

      <Separator />

      {/* Layout Selection */}
      <LayoutSelectionSection
        layout={localConfig.layout}
        onLayoutChange={handleLayoutChange}
      />

      <Separator />

      {/* Field Configuration */}
      <FieldConfigSection
        fields={localConfig.fields}
        onFieldLabelChange={handleFieldLabelChange}
        onFieldRequiredChange={handleFieldRequiredChange}
      />

      <Separator />

      {/* Storage Mode */}
      <StorageModeSection
        storeAs={localConfig.storeAs}
        onStoreAsChange={(v) => handleUpdate({ storeAs: v })}
      />

      {/* Preview */}
      <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
        <p className="font-medium mb-1">Preview:</p>
        <p>Fields will be displayed inline in a row</p>
      </div>

      {workflowId && (
        <VisibilityField
          stepId={stepId}
          sectionId={sectionId}
          workflowId={workflowId}
          visibleIf={step.visibleIf}
          mode="advanced"
        />
      )}
    </div>
  );
}
