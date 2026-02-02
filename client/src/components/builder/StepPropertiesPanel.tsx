/**
 * Step Properties Panel
 * Displays and allows editing of step properties when a step is selected
 */

import { HelpCircle, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useStep, useUpdateStep } from "@/lib/vault-hooks";

import { OptionsEditor } from "./step-properties/OptionsEditor";

interface StepPropertiesPanelProps {
  stepId: string;
  sectionId?: string;
}

type DateTimeType = "date" | "time" | "datetime";
type TextType = "short" | "long";

export function StepPropertiesPanel({ stepId, sectionId: propSectionId }: StepPropertiesPanelProps) {
  const { data: step } = useStep(stepId);
  const updateStepMutation = useUpdateStep();


  // Get sectionId from prop or from the step data
  const sectionId = (propSectionId ?? step?.sectionId) ?? "";

  // Local state only for options (needed for intermediate editing state)
  const [localOptions, setLocalOptions] = useState<string[]>([]);
  const [dateTimeType, setDateTimeType] = useState<DateTimeType>("datetime");
  const [textType, setTextType] = useState<TextType>("short");

  // Initialize local state from step data
  useEffect(() => {
    if (step) {
      // Initialize options for radio/multiple_choice
      const stepOptions = step.options as { options?: string[] } | undefined;
      if ((step.type === "radio" || step.type === "multiple_choice") && stepOptions?.options) {
        setLocalOptions(stepOptions.options);
      }

      // Initialize date/time type
      const dtOptions = step.options as { dateTimeType?: DateTimeType } | undefined;
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
    updateStepMutation.mutate({ id: stepId, sectionId, title });
  };

  const handleDescriptionChange = (description: string) => {
    updateStepMutation.mutate({ id: stepId, sectionId, description });
  };

  const handleRequiredChange = (required: boolean) => {
    updateStepMutation.mutate({ id: stepId, sectionId, required });
  };

  const handleDefaultValueChange = (value: string) => {
    // Parse the value based on step type
    let parsedValue: string | number | boolean | string[] | null = value;

    // For empty string, set to null to clear the default
    if (value === "") {
      parsedValue = null;
    } else if (step.type === "yes_no") {
      // Convert to boolean
      parsedValue = value.toLowerCase() === "yes" || value === "true";
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
      sectionId,
      defaultValue: parsedValue
    });
  };

  const handleOptionsDraftChange = (options: string[]) => {
    setLocalOptions(options);
  };

  const handleOptionsCommitChange = (options: string[]) => {
    setLocalOptions(options);
    updateStepMutation.mutate({
      id: stepId,
      sectionId,
      options: { options },
    });
  };



  const handleDateTimeTypeChange = (type: DateTimeType) => {
    setDateTimeType(type);
    updateStepMutation.mutate({
      id: stepId,
      sectionId,
      options: { dateTimeType: type },
    });
  };

  const handleTextTypeChange = (type: TextType) => {
    setTextType(type);
    // Update the step type itself
    const newType = type === "short" ? "short_text" : "long_text";
    updateStepMutation.mutate({
      id: stepId,
      sectionId,
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
          <p className="text-xs text-muted-foreground px-0.5">
            {step.type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
          </p>
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
            value={
              step.defaultValue === null || step.defaultValue === undefined
                ? "no_default"
                : String(step.defaultValue)
            }
            onValueChange={(val) => {
              let finalVal: boolean | null = null;
              if (val === "true") { finalVal = true; }
              else if (val === "false") { finalVal = false; }

              updateStepMutation.mutate({
                id: stepId,
                sectionId,
                defaultValue: finalVal
              });
            }}
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
              value={
                step.defaultValue === null || step.defaultValue === undefined
                  ? ""
                  : typeof step.defaultValue === "object"
                    ? JSON.stringify(step.defaultValue)
                    : String(step.defaultValue)
              }
              onChange={(e) => handleDefaultValueChange(e.target.value)}
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

      {/* Text Type Toggle (for short_text and long_text) */}
      {(step.type === "short_text" || step.type === "long_text") && (
        <>
          <Separator />
          <div className="space-y-3">
            <Label>Input Type</Label>
            <RadioGroup value={textType} onValueChange={(v) => handleTextTypeChange(v as TextType)}>
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
      )}

      {/* Date/Time Type Selector */}
      {step.type === "date_time" && (
        <>
          <Separator />
          <div className="space-y-3">
            <Label>Date/Time Type</Label>
            <RadioGroup value={dateTimeType} onValueChange={(v) => handleDateTimeTypeChange(v as DateTimeType)}>
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
      )}

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


