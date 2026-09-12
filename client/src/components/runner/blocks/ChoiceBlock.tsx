
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
 * - combobox: Searchable menu that also accepts an unlisted answer (single)
 * - multiple: Checkboxes (multi-select) — the only multi-select presentation
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

import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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

import { CreatableCombobox } from "./choice/CreatableCombobox";
import { useChoiceOptions } from "./choice/useChoiceOptions";

import { isListValue } from "@/lib/choice-utils";
import type { ChoiceAdvancedConfig, ChoiceOption, DynamicOptionsConfig } from "@shared/types/stepConfigs";

export interface ChoiceBlockProps {
  step: Step;
  value: unknown;
  onChange: (value: string | string[]) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
  context?: Record<string, unknown>;
  /** Alias -> step id, so a list-backed source can be found in the id-keyed context. */
  aliasMap?: Record<string, string>;
  /** Run identity for stable seeded randomization. */
  runId?: string;
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
  layout?: 'vertical' | 'horizontal';
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

function RadioChoices({ step, options, value, onChange, readOnly, a11y, layout = 'vertical' }: ChoiceRenderProps) {
  const config = step.config as ChoiceAdvancedConfig | undefined;
  const allowOther = config?.allowOther === true;
  const otherLabel = config?.otherLabel?.trim() ? config.otherLabel : "Other";
  
  const selectedValue = toSingleValue(value);
  const isCustomValue = selectedValue !== "" && !options.some(opt => getOptionValue(opt) === selectedValue);
  
  const [forceOther, setForceOther] = useState(false);
  const isOtherActive = allowOther && (isCustomValue || forceOther);
  
  const radioGroupValue = isOtherActive ? "__other__" : selectedValue;

  return (
    <RadioGroup
      value={radioGroupValue}
      onValueChange={(newValue) => {
        if (!readOnly) {
          if (newValue === "__other__") {
            setForceOther(true);
            onChange(""); 
          } else {
            setForceOther(false);
            onChange(newValue);
          }
        }
      }}
      disabled={readOnly}
      className={layout === 'horizontal' ? 'flex flex-row flex-wrap gap-x-4 gap-y-2' : 'flex flex-col space-y-2'}
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
      {allowOther && (
        <div className="flex flex-col space-y-2">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="__other__" id={`${step.id}-__other__`} />
            <Label htmlFor={`${step.id}-__other__`} className="font-normal cursor-pointer">
              {otherLabel}
            </Label>
          </div>
          {isOtherActive && (
            <div className="ml-6">
               <Input 
                 value={selectedValue} 
                 onChange={(e) => {
                    setForceOther(true);
                    onChange(e.target.value);
                 }} 
                 disabled={readOnly} 
                 placeholder="Please specify..."
                 className="h-8 text-sm"
               />
            </div>
          )}
        </div>
      )}
    </RadioGroup>
  );
}

function DropdownChoice({ step, options, value, onChange, readOnly, a11y }: ChoiceRenderProps) {
  const config = step.config as ChoiceAdvancedConfig | undefined;
  const allowOther = config?.allowOther === true;
  const otherLabel = config?.otherLabel?.trim() ? config.otherLabel : "Other";
  
  const selectedValue = toSingleValue(value);
  const isCustomValue = selectedValue !== "" && !options.some(opt => getOptionValue(opt) === selectedValue);
  
  const [forceOther, setForceOther] = useState(false);
  const isOtherActive = allowOther && (isCustomValue || forceOther);
  
  const selectValue = isOtherActive ? "__other__" : selectedValue;

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(newValue) => {
          if (!readOnly) {
            if (newValue === "__other__") {
              setForceOther(true);
              onChange("");
            } else {
              setForceOther(false);
              onChange(newValue);
            }
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
          {allowOther && (
             <SelectItem value="__other__">{otherLabel}</SelectItem>
          )}
        </SelectContent>
      </Select>
      {isOtherActive && (
        <Input 
          value={selectedValue} 
          onChange={(e) => {
            setForceOther(true);
            onChange(e.target.value);
          }} 
          disabled={readOnly} 
          placeholder="Please specify..."
          className="h-8 text-sm"
        />
      )}
    </div>
  );
}

function MultipleChoices({ step, options, value, onChange, readOnly, a11y, layout = 'vertical' }: ChoiceRenderProps) {
  const config = step.config as ChoiceAdvancedConfig | undefined;
  const allowOther = config?.allowOther === true;
  const otherLabel = config?.otherLabel?.trim() ? config.otherLabel : "Other";
  
  const selectedAliases = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  
  const knownAliases = new Set(options.map(opt => getOptionValue(opt)));
  const customValues = selectedAliases.filter(alias => !knownAliases.has(alias));
  
  const customValue = customValues[0] || "";
  
  const [forceOther, setForceOther] = useState(false);
  const isOtherActive = allowOther && (customValues.length > 0 || forceOther);

  const handleToggleNormal = (optionAlias: string, checked: boolean) => {
    if (readOnly) { return; }
    const base = selectedAliases.filter(a => a !== optionAlias);
    if (checked) { base.push(optionAlias); }
    onChange(base);
  };
  
  const handleToggleOther = (checked: boolean) => {
    if (readOnly) { return; }
    setForceOther(checked);
    if (!checked) {
       onChange(selectedAliases.filter(a => knownAliases.has(a)));
    }
  };

  const handleOtherTextChange = (newText: string) => {
    if (readOnly) { return; }
    setForceOther(true);
    const withoutCustom = selectedAliases.filter(a => knownAliases.has(a));
    if (newText.trim() !== "") {
       withoutCustom.push(newText);
    }
    onChange(withoutCustom);
  };

  return (
    <div className={layout === 'horizontal' ? 'flex flex-row flex-wrap gap-x-4 gap-y-2' : 'space-y-2'}>
      {options.map((option) => {
        const optionAlias = getOptionValue(option);
        const isChecked = selectedAliases.includes(optionAlias);
        return (
          <div key={option.id} className="flex items-center space-x-2">
            <Checkbox
              id={`${step.id}-${option.id}`}
              checked={isChecked}
              onCheckedChange={(checked) => handleToggleNormal(optionAlias, checked === true)}
              disabled={readOnly}
              {...getAriaProps(a11y)}
            />
            <Label htmlFor={`${step.id}-${option.id}`} className="font-normal cursor-pointer">
              {option.label}
            </Label>
          </div>
        );
      })}
      {allowOther && (
        <div className="flex flex-col space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`${step.id}-__other__`}
              checked={isOtherActive}
              onCheckedChange={(checked) => handleToggleOther(checked === true)}
              disabled={readOnly}
            />
            <Label htmlFor={`${step.id}-__other__`} className="font-normal cursor-pointer">
              {otherLabel}
            </Label>
          </div>
          {isOtherActive && (
            <div className="ml-6 mt-1">
               <Input 
                 value={customValue} 
                 onChange={(e) => handleOtherTextChange(e.target.value)} 
                 disabled={readOnly} 
                 placeholder="Please specify..."
                 className="h-8 text-sm"
               />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderComboboxChoice({ options, value, onChange, readOnly, a11y }: ChoiceRenderProps) {
  return (
    <CreatableCombobox
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

function isListStepSourceConfig(
  dynamicConfig: DynamicOptionsConfig | undefined,
  context?: Record<string, unknown>,
  aliasMap?: Record<string, string>
): boolean {
  if (dynamicConfig === null || typeof dynamicConfig !== "object" || dynamicConfig.type !== "list") {
    return false;
  }

  const listVariable = dynamicConfig.listVariable;
  if (listVariable === undefined || listVariable === "") {
    return false;
  }

  const resolvedStepId = aliasMap?.[listVariable];
  const sourceData = context
    ? (Object.prototype.hasOwnProperty.call(context, listVariable)
        ? context[listVariable]
        : (resolvedStepId !== undefined && Object.prototype.hasOwnProperty.call(context, resolvedStepId)
            ? context[resolvedStepId]
            : undefined))
    : undefined;

  // Stored choice values for list steps are stable itemIds (per Decision 8).
  // Scope missing-state detection strictly to list-step-sourced dynamic options;
  // static options and query-block sources (which output ListVariables / arrays)
  // remain behaviorally untouched (AC8).
  return (
    isListValue(sourceData) ||
    (sourceData === undefined &&
      (dynamicConfig.valuePath === "" ||
        dynamicConfig.valuePath === undefined ||
        dynamicConfig.valuePath === "itemId"))
  );
}

interface MissingOptionsParams {
  step: Step;
  options: ChoiceOption[];
  value: unknown;
  displayMode: string;
  context?: Record<string, unknown>;
  aliasMap?: Record<string, string>;
}

function resolveMissingListOptions({
  step,
  options,
  value,
  displayMode,
  context,
  aliasMap,
}: MissingOptionsParams): ChoiceOption[] {
  // CreatableCombobox is designed to accept arbitrary custom values typed by respondents.
  // An unmatched value in a creatable combobox is treated as a custom user-typed answer
  // (rendered with a 'custom' tag) rather than a missing list item reference.
  if (displayMode === "combobox" || step.type !== "choice") {
    return [];
  }

  const dynamicConfig = (step.config as ChoiceAdvancedConfig | undefined)?.options as DynamicOptionsConfig | undefined;
  if (!isListStepSourceConfig(dynamicConfig, context, aliasMap)) {
    return [];
  }

  const selectedIds = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v !== "")
    : typeof value === "string" && value !== ""
      ? [value]
      : [];

  if (selectedIds.length === 0) {
    return [];
  }

  // Stored value is an itemId and nothing else, so a deleted item's original label
  // is unrecoverable from the stored value alone. The label is generic and honest
  // rather than inventing a name, so the respondent clearly sees it needs re-picking.
  const missingOptions: ChoiceOption[] = [];
  for (const selectedId of selectedIds) {
    const exists = options.some((opt) => getOptionValue(opt) === selectedId);
    if (!exists) {
      missingOptions.push({
        id: selectedId,
        alias: selectedId,
        label: "(Deleted item)",
      });
    }
  }

  return missingOptions;
}

export function ChoiceBlockRenderer({
  step,
  value,
  onChange,
  readOnly,
  context,
  aliasMap,
  runId,
  ariaDescribedBy,
  required,
  hasError,
}: ChoiceBlockProps) {
  const {
    options,
    loading,
    error,
    displayMode,
    allowMultiple
  } = useChoiceOptions(step, context, aliasMap, runId);

  const layout = (step.config as ChoiceAdvancedConfig | undefined)?.layout ?? "vertical";
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

  // -------------------------------------------------------------------------
  // Missing-State Detection for List-Step Dynamic Choices (AC6)
  // -------------------------------------------------------------------------
  const missingOptions = resolveMissingListOptions({
    step,
    options,
    value,
    displayMode,
    context,
    aliasMap,
  });
  const effectiveOptions = missingOptions.length > 0 ? [...options, ...missingOptions] : options;

  if (effectiveOptions.length === 0) {
    return <div className="text-sm text-muted-foreground">No options available</div>;
  }

  // -------------------------------------------------------------------------
  // Render: Radio Buttons
  // -------------------------------------------------------------------------
  if (displayMode === "radio" && !allowMultiple) {
    return <RadioChoices step={step} options={effectiveOptions} value={currentValue} onChange={onChange} readOnly={readOnly} a11y={a11y} layout={layout} />;
  }

  // -------------------------------------------------------------------------
  // Render: Dropdown (Select)
  // -------------------------------------------------------------------------
  if (displayMode === "dropdown" && !allowMultiple) {
    return <DropdownChoice step={step} options={effectiveOptions} value={currentValue} onChange={onChange} readOnly={readOnly} a11y={a11y} />;
  }

  // -------------------------------------------------------------------------
  // Render: Combo Box (search + enter an unlisted answer)
  // -------------------------------------------------------------------------
  if (displayMode === "combobox" && !allowMultiple) {
    return renderComboboxChoice({ step, options: effectiveOptions, value: currentValue, onChange, readOnly, a11y });
  }

  // -------------------------------------------------------------------------
  // Render: Multiple Choice (Checkboxes)
  // -------------------------------------------------------------------------
  if (displayMode === "multiple" || allowMultiple) {
    return <MultipleChoices step={step} options={effectiveOptions} value={currentValue} onChange={onChange} readOnly={readOnly} a11y={a11y} layout={layout} />;
  }

  // Fallback
  return <div className="text-sm text-muted-foreground">Invalid choice configuration</div>;
}
