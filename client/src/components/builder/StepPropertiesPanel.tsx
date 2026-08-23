/**
 * Step Properties Panel
 * Displays and allows editing of step properties when a step is selected
 */

import { useState, useEffect } from "react";

import { QuestionTypeIcon } from "@/components/shared/QuestionTypeIcon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useStep, useUpdateStep } from "@/lib/vault-hooks";

import { DefaultValueEditor } from "./step-properties/DefaultValueEditor";
import { OptionsEditor } from "./step-properties/OptionsEditor";
import { StepTypeSettings } from "./step-properties/StepTypeSettings";

interface StepPropertiesPanelProps {
  stepId: string;
  pageId?: string;
}

type DateTimeType = "date" | "time" | "datetime";
type TextType = "short" | "long";

export function StepPropertiesPanel({ stepId, pageId: propPageId }: StepPropertiesPanelProps) {
  const { data: step } = useStep(stepId);
  const updateStepMutation = useUpdateStep();


  // Get pageId from prop or from the step data
  const pageId = (propPageId ?? step?.pageId) ?? "";

  // Local state only for options (needed for intermediate editing state)
  const [localOptions, setLocalOptions] = useState<string[]>([]);
  const [dateTimeType, setDateTimeType] = useState<DateTimeType>("datetime");
  const [textType, setTextType] = useState<TextType>("short");

  // Initialize local state from step data
  useEffect(() => {
    if (step) {
      // Initialize options for radio/multiple_choice
      const stepOptions = step.config as { options?: string[] } | undefined;
      if ((step.type === "radio" || step.type === "multiple_choice") && stepOptions?.options) {
        setLocalOptions(stepOptions.options);
      }

      // Initialize date/time type
      const dtOptions = step.config as { dateTimeType?: DateTimeType } | undefined;
      if (step.type === "date_time" && dtOptions?.dateTimeType) {
        setDateTimeType(dtOptions.dateTimeType);
      }

      // Initialize text type from step type
      if (step.type === "short_text") {
        setTextType("short");
      } else if (step.type === "long_text") {
        setTextType("long");
      }
    }
  }, [step]);



  if (!step) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const handleTitleChange = (title: string) => {
    updateStepMutation.mutate({ id: stepId, pageId, title });
  };

  const handleDescriptionChange = (description: string) => {
    updateStepMutation.mutate({ id: stepId, pageId, description });
  };

  const handleRequiredChange = (required: boolean) => {
    updateStepMutation.mutate({ id: stepId, pageId, required });
  };

  const handleDefaultValueChange = (value: string) => {
    // Parse the value based on step type
    let parsedValue: string | number | boolean | string[] | null = value;

    // For empty string, set to null to clear the default (or no_default)
    if (value === "" || value === "no_default") {
      parsedValue = null;
    } else if (step.type === "yes_no") {
      // Convert to boolean
      // Handled by Select value now returning "true"/"false" strings
      if (value === "true") { parsedValue = true; }
      if (value === "false") { parsedValue = false; }
    } else if (step.type === "multiple_choice") {
      // For multiple choice, try to parse as JSON array
      try {
        parsedValue = JSON.parse(value) as string[];
      } catch {
        // If not valid JSON, keep as string
        parsedValue = value;
      }
    }

    updateStepMutation.mutate({
      id: stepId,
      pageId,
      defaultValue: parsedValue
    });
  };

  const handleOptionsDraftChange = (options: string[]) => {
    setLocalOptions(options);
  };

  const handleOptionsCommitChange = (options: string[]) => {
    setLocalOptions(options);
    updateStepMutation.mutate({ id: stepId, pageId, config: { options } });
  };

  const handleDateTimeTypeChange = (type: DateTimeType) => {
    setDateTimeType(type);
    updateStepMutation.mutate({ id: stepId, pageId, config: { dateTimeType: type } });
  };

  const handleTextTypeChange = (type: TextType) => {
    setTextType(type);
    // Update the step type itself
    const newType = type === "short" ? "short_text" : "long_text";
    updateStepMutation.mutate({
      id: stepId,
      pageId,
      type: newType,
    });
  };



  return (
    <div className="p-4 space-y-6">
      <div>
        <div className="space-y-1">
          <Input
            value={step.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="font-semibold text-lg px-2 -ml-2 border-transparent hover:border-input focus:border-input transition-colors h-auto py-1"
            placeholder="Step Title"
            autoFocus
          />
          <div className="flex items-center gap-1.5 px-0.5">
            <QuestionTypeIcon type={step.type} size="sm" />
            <p className="text-xs text-muted-foreground">
              {step.type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={step.description ?? ""}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          placeholder="Add a description for this question..."
          rows={3}
        />
      </div>

      {/* Required toggle */}
      <div className="flex items-center justify-between">
        <Label htmlFor="required">Required</Label>
        <Switch
          id="required"
          checked={step.required ?? false}
          onCheckedChange={handleRequiredChange}
        />
      </div>

      <Separator />

      {/* Default Value */}
      <DefaultValueEditor
        step={step}
        onChange={handleDefaultValueChange}
      />

      {/* Type Settings (Text, Date/Time) */}
      <StepTypeSettings
        step={step}
        textType={textType}
        dateTimeType={dateTimeType}
        onTextTypeChange={handleTextTypeChange}
        onDateTimeTypeChange={handleDateTimeTypeChange}
      />

      {/* Options Editor (for radio and multiple_choice) */}
      {(step.type === "radio" || step.type === "multiple_choice") && (
        <>
          <Separator />
          <OptionsEditor
            options={localOptions}
            onDraftChange={handleOptionsDraftChange}
            onCommitChange={handleOptionsCommitChange}
          />
        </>
      )}
    </div>
  );
}

