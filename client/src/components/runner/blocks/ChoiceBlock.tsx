/**
 * ChoiceBlockRenderer - Choice Input (Radio/Dropdown/Multiple)
 *
 * CRITICAL COMPONENT - Handles all choice-based inputs with alias support
 *
 * Handles:
 * - radio (legacy simple list)
 * - multiple_choice (legacy simple list)
 * - choice (advanced with full ChoiceOption objects)
 *
 * Display modes:
 * - radio: Radio buttons (single choice)
 * - dropdown: Select menu (single choice)
 * - multiple: Checkboxes (multi-select)
 *
 * Value Storage Rules:
 * - Single choice (radio/dropdown): Store option.alias (string)
 * - Multi-choice (checkboxes): Store array of aliases (string[])
 * - Aliases are THE canonical value used in logic, JS, and documents
 *
 * Storage: string OR string[] (based on allowMultiple)
 */

import React from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Step } from "@/types";
import type { ChoiceAdvancedConfig, ChoiceOption } from "@/../../shared/types/stepConfigs";

export interface ChoiceBlockProps {
  step: Step;
  value: any;
  onChange: (value: string | string[]) => void;
  readOnly?: boolean;
}

export function ChoiceBlockRenderer({ step, value, onChange, readOnly }: ChoiceBlockProps) {
  // -------------------------------------------------------------------------
  // Parse configuration
  // -------------------------------------------------------------------------
  let displayMode: "radio" | "dropdown" | "multiple" = "radio";
  let allowMultiple = false;
  let options: ChoiceOption[] = [];

  // Legacy radio type
  if (step.type === "radio") {
    displayMode = "radio";
    allowMultiple = false;

    const legacyOptions = (step.config as any)?.options || (step.options as any)?.options || [];

    // Handle both string[] and {id,label}[] formats
    if (Array.isArray(legacyOptions)) {
      options = legacyOptions.map((opt: any, idx: number) => {
        if (typeof opt === "string") {
          return { id: opt, label: opt, alias: opt };
        } else {
          return {
            id: opt.id || `opt${idx}`,
            label: opt.label || opt,
            alias: opt.alias || opt.id || opt.label || `opt${idx}`,
          };
        }
      });
    }
  }

  // Legacy multiple_choice type
  else if (step.type === "multiple_choice") {
    displayMode = "multiple";
    allowMultiple = true;

    const legacyOptions = (step.config as any)?.options || (step.options as any)?.options || [];

    if (Array.isArray(legacyOptions)) {
      options = legacyOptions.map((opt: any, idx: number) => {
        if (typeof opt === "string") {
          return { id: opt, label: opt, alias: opt };
        } else {
          return {
            id: opt.id || `opt${idx}`,
            label: opt.label || opt,
            alias: opt.alias || opt.id || opt.label || `opt${idx}`,
          };
        }
      });
    }
  }

  // Advanced choice type
  else if (step.type === "choice") {
    const config = step.config as ChoiceAdvancedConfig;
    displayMode = config?.display || "radio";
    allowMultiple = config?.allowMultiple ?? false;
    options = config?.options || [];

    // Ensure all options have aliases
    options = options.map((opt) => ({
      ...opt,
      alias: opt.alias || opt.id,
    }));
  }

  // -------------------------------------------------------------------------
  // Value handling
  // -------------------------------------------------------------------------
  const currentValue = value || (allowMultiple ? [] : "");

  // -------------------------------------------------------------------------
  // Render: Radio Buttons
  // -------------------------------------------------------------------------
  if (displayMode === "radio" && !allowMultiple) {
    return (
      <RadioGroup
        value={currentValue}
        onValueChange={(newValue) => !readOnly && onChange(newValue)}
        disabled={readOnly}
      >
        {options.map((option) => (
          <div key={option.id} className="flex items-center space-x-2">
            <RadioGroupItem value={option.alias || option.id} id={`${step.id}-${option.id}`} />
            <Label htmlFor={`${step.id}-${option.id}`} className="font-normal cursor-pointer">
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Dropdown (Select)
  // -------------------------------------------------------------------------
  if (displayMode === "dropdown" && !allowMultiple) {
    return (
      <Select
        value={currentValue}
        onValueChange={(newValue) => !readOnly && onChange(newValue)}
        disabled={readOnly}
      >
        <SelectTrigger id={step.id}>
          <SelectValue placeholder="Select an option..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.alias || option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Multiple Choice (Checkboxes)
  // -------------------------------------------------------------------------
  if (displayMode === "multiple" || allowMultiple) {
    const selectedAliases = Array.isArray(currentValue) ? currentValue : [];

    const handleToggle = (optionAlias: string, checked: boolean) => {
      if (readOnly) return;

      let newValue: string[];
      if (checked) {
        newValue = [...selectedAliases, optionAlias];
      } else {
        newValue = selectedAliases.filter((a: string) => a !== optionAlias);
      }
      onChange(newValue);
    };

    return (
      <div className="space-y-2">
        {options.map((option) => {
          const optionAlias = option.alias || option.id;
          const isChecked = selectedAliases.includes(optionAlias);

          return (
            <div key={option.id} className="flex items-center space-x-2">
              <Checkbox
                id={`${step.id}-${option.id}`}
                checked={isChecked}
                onCheckedChange={(checked) => handleToggle(optionAlias, !!checked)}
                disabled={readOnly}
              />
              <Label htmlFor={`${step.id}-${option.id}`} className="font-normal cursor-pointer">
                {option.label}
              </Label>
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback
  return <div className="text-sm text-muted-foreground">Invalid choice configuration</div>;
}
