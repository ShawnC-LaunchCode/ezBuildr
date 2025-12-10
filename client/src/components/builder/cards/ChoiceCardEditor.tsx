/**
 * Choice Block Card Editor
 * Editor for choice blocks (radio, multiple_choice, choice)
 *
 * Config shape:
 * {
 *   display: "radio" | "dropdown" | "multiple",
 *   allowMultiple: boolean,
 *   options: Array<{ id: string; label: string; alias?: string; }>
 * }
 */

import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Trash2, Plus, AlertCircle } from "lucide-react";
import { LabelField } from "./common/LabelField";
import { AliasField } from "./common/AliasField";
import { RequiredToggle } from "./common/RequiredToggle";
import { SectionHeader } from "./common/EditorField";
import { useUpdateStep } from "@/lib/vault-hooks";
import { useToast } from "@/hooks/use-toast";
import type { ChoiceAdvancedConfig, ChoiceOption, LegacyMultipleChoiceConfig, LegacyRadioConfig } from "@/../../shared/types/stepConfigs";

interface ChoiceCardEditorProps {
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

export function ChoiceCardEditor({ stepId, sectionId, step }: ChoiceCardEditorProps) {
  const updateStepMutation = useUpdateStep();
  const { toast } = useToast();

  // Determine mode
  const isAdvancedMode = step.type === "choice";
  const isEasyMode = step.type === "radio" || step.type === "multiple_choice";

  // Parse config based on mode
  const parseConfig = () => {
    if (isAdvancedMode) {
      const config = step.config as ChoiceAdvancedConfig | undefined;
      return {
        display: config?.display || "radio",
        allowMultiple: config?.allowMultiple || false,
        options: config?.options || [],
      };
    } else {
      // Easy mode - convert legacy format
      const config = step.config as (LegacyMultipleChoiceConfig | LegacyRadioConfig) | undefined;
      const legacyOptions = config?.options || [];

      // Convert string[] to ChoiceOption[]
      const options: ChoiceOption[] = Array.isArray(legacyOptions)
        ? legacyOptions.map((opt: any, idx: number) => {
            if (typeof opt === 'string') {
              return {
                id: `opt${idx + 1}`,
                label: opt,
                alias: `option${idx + 1}`,
              };
            } else {
              return {
                id: opt.id || `opt${idx + 1}`,
                label: opt.label || opt,
                alias: opt.id || `option${idx + 1}`,
              };
            }
          })
        : [];

      return {
        display: step.type === "multiple_choice" ? "multiple" : "radio",
        allowMultiple: step.type === "multiple_choice",
        options,
      };
    }
  };

  const [localConfig, setLocalConfig] = useState(parseConfig());
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    setLocalConfig(parseConfig());
  }, [step.config, step.type]);

  const validateOptions = (options: ChoiceOption[]): string[] => {
    const errors: string[] = [];

    if (options.length === 0) {
      errors.push("At least one option is required");
    }

    // Check for duplicate aliases
    const aliases = options.map(opt => opt.alias || opt.id);
    const duplicates = aliases.filter((item, index) => aliases.indexOf(item) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate aliases found: ${[...new Set(duplicates)].join(', ')}`);
    }

    // Check for empty labels
    const emptyLabels = options.filter(opt => !opt.label || opt.label.trim() === '');
    if (emptyLabels.length > 0) {
      errors.push("All options must have a label");
    }

    return errors;
  };

  const handleUpdate = (updates: Partial<typeof localConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);

    // Validate
    const validationErrors = validateOptions(newConfig.options);
    setErrors(validationErrors);

    if (validationErrors.length > 0) {
      return; // Don't save if invalid
    }

    // Build config based on mode
    if (isAdvancedMode) {
      const configToSave: ChoiceAdvancedConfig = {
        display: newConfig.display as "radio" | "dropdown" | "multiple",
        allowMultiple: newConfig.allowMultiple,
        options: newConfig.options,
      };
      updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
    } else {
      // Easy mode - save in legacy format
      const configToSave = {
        options: newConfig.options.map(opt => ({
          id: opt.id,
          label: opt.label,
        })),
      };
      updateStepMutation.mutate({ id: stepId, sectionId, config: configToSave });
    }
  };

  const handleDisplayChange = (display: "radio" | "dropdown" | "multiple") => {
    const allowMultiple = display === "multiple";

    if (isEasyMode) {
      // In easy mode, changing display means changing type
      const newType = allowMultiple ? "multiple_choice" : "radio";
      updateStepMutation.mutate({ id: stepId, sectionId, type: newType });
    } else {
      // In advanced mode, update config
      handleUpdate({ display, allowMultiple });
    }
  };

  const handleAddOption = () => {
    const newOptions = [
      ...localConfig.options,
      {
        id: `opt${localConfig.options.length + 1}`,
        label: `Option ${localConfig.options.length + 1}`,
        alias: `option${localConfig.options.length + 1}`,
      },
    ];
    handleUpdate({ options: newOptions });
  };

  const handleUpdateOption = (index: number, field: keyof ChoiceOption, value: string) => {
    const newOptions = [...localConfig.options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    handleUpdate({ options: newOptions });
  };

  const handleDeleteOption = (index: number) => {
    if (localConfig.options.length <= 1) {
      toast({
        title: "Cannot delete",
        description: "At least one option is required",
        variant: "destructive",
      });
      return;
    }
    const newOptions = localConfig.options.filter((_, i) => i !== index);
    handleUpdate({ options: newOptions });
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

      {/* Display Mode */}
      <div className="space-y-3">
        <SectionHeader
          title="Display Mode"
          description={isEasyMode ? "Fixed in easy mode" : "How choices are displayed"}
        />
        <RadioGroup
          value={localConfig.display}
          onValueChange={(v) => handleDisplayChange(v as "radio" | "dropdown" | "multiple")}
          disabled={isEasyMode}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="radio" id="display-radio" disabled={isEasyMode} />
            <Label
              htmlFor="display-radio"
              className={isEasyMode ? "text-muted-foreground" : "cursor-pointer"}
            >
              Radio buttons (single choice)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="dropdown" id="display-dropdown" disabled={isEasyMode} />
            <Label
              htmlFor="display-dropdown"
              className={isEasyMode ? "text-muted-foreground" : "cursor-pointer"}
            >
              Dropdown (single choice)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="multiple" id="display-multiple" disabled={isEasyMode} />
            <Label
              htmlFor="display-multiple"
              className={isEasyMode ? "text-muted-foreground" : "cursor-pointer"}
            >
              Multiple choice (checkboxes)
            </Label>
          </div>
        </RadioGroup>
      </div>

      <Separator />

      {/* Options Editor */}
      <div className="space-y-3">
        <SectionHeader
          title="Options"
          description="Configure the available choices"
        />

        {/* Options List */}
        <div className="space-y-2">
          {localConfig.options.map((option, index) => (
            <div key={option.id} className="flex items-start gap-2 p-3 border rounded-md bg-background">
              {/* Drag Handle (visual only for now) */}
              <div className="pt-2 cursor-grab">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Option Fields */}
              <div className="flex-1 space-y-2">
                {/* Display Label */}
                <Input
                  value={option.label}
                  onChange={(e) => handleUpdateOption(index, 'label', e.target.value)}
                  placeholder="Display label"
                  className="text-sm"
                />

                {/* Alias (in advanced mode or show in easy mode as read-only) */}
                <Input
                  value={option.alias || option.id}
                  onChange={(e) => handleUpdateOption(index, 'alias', e.target.value)}
                  placeholder="Variable value"
                  className="text-sm font-mono"
                  disabled={isEasyMode}
                />
              </div>

              {/* Delete Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 mt-1"
                onClick={() => handleDeleteOption(index)}
                disabled={localConfig.options.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Add Option Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleAddOption}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Option
        </Button>
      </div>

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-md">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Validation Errors</p>
            <ul className="list-disc list-inside">
              {errors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
