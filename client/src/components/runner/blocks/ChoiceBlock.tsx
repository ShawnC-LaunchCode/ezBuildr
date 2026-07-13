
/**
 * ChoiceBlockRenderer - Choice Input (Radio/Dropdown/Multiple)
 *
 * CRITICAL COMPONENT - Handles all choice-based inputs with alias support
 *
 * Handles:
 * - radio (legacy simple list)
 * - multiple_choice (legacy simple list)
 * - choice (advanced with full ChoiceOption objects or dynamic sources)
 *
 * Display modes:
 * - radio: Radio buttons (single choice)
 * - dropdown: Select menu (single choice)
 * - multiple: Checkboxes (multi-select)
 *
 * Option Sources:
 * - Static: Predefined options
 * - List: From a ListVariable (Read Table / List Tools blocks)
 * - Table Column: Direct table column read (convenience path)
 *
 * Value Storage Rules:
 * - Single choice (radio/dropdown): Store option.alias (string)
 * - Multi-choice (checkboxes): Store array of aliases (string[])
 * - Aliases are THE canonical value used in logic, JS, and documents
 *
 * Storage: string OR string[] (based on allowMultiple)
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Step } from "@/types";

import { SearchableDropdown } from "./choice/SearchableDropdown";
import { useChoiceOptions } from "./choice/useChoiceOptions";

export interface ChoiceBlockProps {
  step: Step;
  value: unknown;
  onChange: (value: string | string[]) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
  context?: Record<string, unknown>;
}

export function ChoiceBlockRenderer({ step, value, onChange, readOnly, context , ariaDescribedBy, required, hasError }: ChoiceBlockProps) {
  const {
    options,
    loading,
    error,
    displayMode,
    allowMultiple,
    isSearchable
  } = useChoiceOptions(step, context);

  // -------------------------------------------------------------------------
  // Value handling
  // -------------------------------------------------------------------------
  const currentValue = value ?? (allowMultiple ? [] : "");

  // -------------------------------------------------------------------------
  // Loading & Error States
  // -------------------------------------------------------------------------
  if (loading) {
    return <div className="text-sm text-muted-foreground animate-pulse" role="status">Loading options...</div>;
  }

  if (error !== null) {
    return (
      <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded p-2" role="alert">
        Error: {error}
      </div>
    );
  }

  if (options.length === 0) {
    return <div className="text-sm text-muted-foreground">No options available</div>;
  }

  // -------------------------------------------------------------------------
  // Render: Radio Buttons
  // -------------------------------------------------------------------------
  if (displayMode === "radio" && !allowMultiple) {
    return (
      <RadioGroup
        value={currentValue as string}
        onValueChange={(newValue) => {
          if (!readOnly) {
            onChange(newValue);
          }
        }}
        disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
      >
        {options.map((option) => (
          <div key={option.id} className="flex items-center space-x-2">
            <RadioGroupItem value={option.alias ?? option.id} id={`${step.id}-${option.id}`} />
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
    if (isSearchable) {
      return (
        <SearchableDropdown
          options={options}
          value={currentValue as string}
          onChange={(val) => {
            if (!readOnly) {
              onChange(val);
            }
          }}
          disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
      />
      );
    }

    return (
      <Select
        value={currentValue as string}
        onValueChange={(newValue) => {
          if (!readOnly) {
            onChange(newValue);
          }
        }}
        disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
      >
        <SelectTrigger id={step.id}>
          <SelectValue placeholder="Select an option..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.alias ?? option.id}>
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
    const selectedAliases = Array.isArray(currentValue) ? (currentValue as string[]) : [];

    const handleToggle = (optionAlias: string, checked: boolean) => {
      if (readOnly) {
        return;
      }

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
          const optionAlias = option.alias ?? option.id;
          const isChecked = selectedAliases.includes(optionAlias);

          return (
            <div key={option.id} className="flex items-center space-x-2">
              <Checkbox
                id={`${step.id}-${option.id}`}
                checked={isChecked}
                onCheckedChange={(checked) => handleToggle(optionAlias, checked === true)}
                disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
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
