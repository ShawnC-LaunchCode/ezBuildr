/**
 * Multi-Field Block Card Editor
 * Editor for multi-field blocks (first_last, contact, date_range)
 *
 * Config shape:
 * {
 *   layout: "first_last" | "contact" | "date_range" | "custom",
 *   fields: Array<{ key: string; label: string; type: string; required: boolean; }>,
 *   storeAs: "separate" | "combined"
 * }
 */

import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { LabelField } from "./common/LabelField";
import { AliasField } from "./common/AliasField";
import { RequiredToggle } from "./common/RequiredToggle";
import { SectionHeader } from "./common/EditorField";
import { useUpdateStep } from "@/lib/vault-hooks";
import type { MultiFieldConfig } from "@/../../shared/types/stepConfigs";

interface MultiFieldCardEditorProps {
  stepId: string;
  sectionId: string;
  step: {
    id: string;
    type: string;
    title: string;
    alias: string | null;
    required: boolean;
    config: any;
  };
}

// Layout presets
const LAYOUT_PRESETS: Record<string, Array<{ key: string; label: string; type: string; required: boolean }>> = {
  first_last: [
    { key: "first", label: "First Name", type: "text" as const, required: true },
    { key: "last", label: "Last Name", type: "text" as const, required: true },
  ],
  contact: [
    { key: "email", label: "Email", type: "email" as const, required: true },
    { key: "phone", label: "Phone", type: "phone" as const, required: false },
  ],
  date_range: [
    { key: "start", label: "Start Date", type: "date" as const, required: true },
    { key: "end", label: "End Date", type: "date" as const, required: true },
  ],
};

export function MultiFieldCardEditor({ stepId, sectionId, step }: MultiFieldCardEditorProps) {
  const updateStepMutation = useUpdateStep();

  // Parse config
  const config = step.config as MultiFieldConfig | undefined;
  const [localConfig, setLocalConfig] = useState({
    layout: (config?.layout || "first_last") as "first_last" | "contact" | "date_range" | "custom",
    fields: config?.fields || LAYOUT_PRESETS.first_last,
    storeAs: (config?.storeAs || "separate") as "separate" | "combined",
  });

  useEffect(() => {
    const config = step.config as MultiFieldConfig | undefined;
    setLocalConfig({
      layout: (config?.layout || "first_last") as "first_last" | "contact" | "date_range" | "custom",
      fields: config?.fields || LAYOUT_PRESETS.first_last,
      storeAs: (config?.storeAs || "separate") as "separate" | "combined",
    });
  }, [step.config]);

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    const configToSave: MultiFieldConfig = {
      layout: newConfig.layout,
      fields: newConfig.fields as any,
      storeAs: newConfig.storeAs,
    };

    updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
  };

  const handleLayoutChange = (layout: "first_last" | "contact" | "date_range") => {
    const newFields = LAYOUT_PRESETS[layout];
    handleUpdate({ layout, fields: newFields });
  };

  const handleFieldLabelChange = (index: number, label: string) => {
    const newFields = [...localConfig.fields];
    newFields[index] = { ...newFields[index], label };
    handleUpdate({ fields: newFields });
  };

  const handleFieldRequiredChange = (index: number, required: boolean) => {
    const newFields = [...localConfig.fields];
    newFields[index] = { ...newFields[index], required };
    handleUpdate({ fields: newFields });
  };

  const handleLabelChange = (title: string) => {
    updateStepMutation.mutate({ id: stepId, sectionId, title });
  };

  const handleAliasChange = (alias: string | null) => {
    updateStepMutation.mutate({ id: stepId, sectionId, alias });
  };

  const handleRequiredChange = (required: boolean) => {
    updateStepMutation.mutate({ id: stepId, sectionId, required });
  };

  return (
    <div className="space-y-4 p-4 border-t bg-muted/30">
      {/* Label */}
      <LabelField value={step.title} onChange={handleLabelChange} />

      {/* Alias */}
      <AliasField value={step.alias} onChange={handleAliasChange} />

      {/* Required Toggle */}
      <RequiredToggle checked={step.required} onChange={handleRequiredChange} />

      <Separator />

      {/* Layout Selection */}
      <div className="space-y-3">
        <SectionHeader
          title="Layout Type"
          description="Choose the type of multi-field layout"
        />
        <RadioGroup
          value={localConfig.layout}
          onValueChange={(v) => handleLayoutChange(v as "first_last" | "contact" | "date_range")}
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

      <Separator />

      {/* Field Configuration */}
      <div className="space-y-3">
        <SectionHeader
          title="Fields"
          description="Configure the sub-fields"
        />

        <div className="space-y-3">
          {localConfig.fields.map((field, index) => (
            <div key={field.key} className="p-3 border rounded-md bg-background space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground w-16">{field.key}</span>
                <Input
                  value={field.label}
                  onChange={(e) => handleFieldLabelChange(index, e.target.value)}
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
                    onCheckedChange={(checked) => handleFieldRequiredChange(index, checked)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Storage Mode */}
      <div className="space-y-3">
        <SectionHeader
          title="Storage Mode"
          description="How the data is stored"
        />
        <RadioGroup
          value={localConfig.storeAs}
          onValueChange={(v) => handleUpdate({ storeAs: v as "separate" | "combined" })}
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

      {/* Preview */}
      <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
        <p className="font-medium mb-1">Preview:</p>
        <p>Fields will be displayed inline in a row</p>
      </div>
    </div>
  );
}
