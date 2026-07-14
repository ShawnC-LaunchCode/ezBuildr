
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

import type { ChoiceOption } from "@shared/types/stepConfigs";

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

interface ChoiceA11yProps {
  describedBy?: string;
  required?: boolean;
  invalid?: boolean;
}

interface ChoiceRenderProps {
  step: Step;
  options: ChoiceOption[];
  value: unknown;
  onChange: (value: string | string[]) => void;
  readOnly?: boolean;
  a11y: ChoiceA11yProps;
}

function getOptionValue(option: ChoiceOption): string {
  return option.alias ?? option.id;
}

function toSingleValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getAriaProps(a11y: ChoiceA11yProps) {
  return {
    "aria-describedby": a11y.describedBy,
    "aria-required": a11y.required === true ? true : undefined,
    "aria-invalid": a11y.invalid === true ? true : undefined,
  };
}

function renderRadioChoices({ step, options, value, onChange, readOnly, a11y }: ChoiceRenderProps) {
  return (
    <RadioGroup
      value={toSingleValue(value)}
      onValueChange={(newValue) => {
        if (!readOnly) {
          onChange(newValue);
        }
      }}
      disabled={readOnly}
      {...getAriaProps(a11y)}
    >
      {options.map((option) => (
        <div key={option.id} className="flex items-center space-x-2">
          <RadioGroupItem value={getOptionValue(option)} id={`${step.id}-${option.id}`} />
          <Label htmlFor={`${step.id}-${option.id}`} className="font-normal cursor-pointer">
            {option.label}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

function renderDropdownChoice(
  props: ChoiceRenderProps & { isSearchable: boolean }
) {
  const { step, options, value, onChange, readOnly, a11y, isSearchable } = props;

  if (isSearchable) {
    return (
      <SearchableDropdown
        options={options}
        value={toSingleValue(value)}
        onChange={(val) => {
          if (!readOnly) {
            onChange(val);
          }
        }}
        disabled={readOnly}
        ariaDescribedBy={a11y.describedBy}
        ariaRequired={a11y.required}
        ariaInvalid={a11y.invalid}
      />
    );
  }

  return (
    <Select
      value={toSingleValue(value)}
      onValueChange={(newValue) => {
        if (!readOnly) {
          onChange(newValue);
        }
      }}
      disabled={readOnly}
      {...getAriaProps(a11y)}
    >
      <SelectTrigger id={step.id}>
        <SelectValue placeholder="Select an option..." />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={getOptionValue(option)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function renderMultipleChoices({ step, options, value, onChange, readOnly, a11y }: ChoiceRenderProps) {
  const selectedAliases = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

  const handleToggle = (optionAlias: string, checked: boolean) => {
    if (readOnly) {
      return;
    }

    const nextValue = checked
      ? [...selectedAliases, optionAlias]
      : selectedAliases.filter((alias) => alias !== optionAlias);
    onChange(nextValue);
  };

  return (
    <div className="space-y-2">
      {options.map((option) => {
        const optionAlias = getOptionValue(option);
        const isChecked = selectedAliases.includes(optionAlias);

        return (
          <div key={option.id} className="flex items-center space-x-2">
            <Checkbox
              id={`${step.id}-${option.id}`}
              checked={isChecked}
              onCheckedChange={(checked) => handleToggle(optionAlias, checked === true)}
              disabled={readOnly}
              {...getAriaProps(a11y)}
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

export function ChoiceBlockRenderer({
  step,
  value,
  onChange,
  readOnly,
  context,
  ariaDescribedBy,
  required,
  hasError,
}: ChoiceBlockProps) {
  const {
    options,
    loading,
    error,
    displayMode,
    allowMultiple,
    isSearchable
  } = useChoiceOptions(step, context);

  const currentValue = value ?? (allowMultiple ? [] : "");
  const a11y: ChoiceA11yProps = {
    describedBy: ariaDescribedBy,
    required,
    invalid: hasError,
  };

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
    return renderRadioChoices({ step, options, value: currentValue, onChange, readOnly, a11y });
  }

  // -------------------------------------------------------------------------
  // Render: Dropdown (Select)
  // -------------------------------------------------------------------------
  if (displayMode === "dropdown" && !allowMultiple) {
    return renderDropdownChoice({ step, options, value: currentValue, onChange, readOnly, a11y, isSearchable });
  }

  // -------------------------------------------------------------------------
  // Render: Multiple Choice (Checkboxes)
  // -------------------------------------------------------------------------
  if (displayMode === "multiple" || allowMultiple) {
    return renderMultipleChoices({ step, options, value: currentValue, onChange, readOnly, a11y });
  }

  // Fallback
  return <div className="text-sm text-muted-foreground">Invalid choice configuration</div>;
}
