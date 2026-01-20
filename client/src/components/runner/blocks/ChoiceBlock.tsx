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

import { ChevronsUpDown, Check } from "lucide-react";
import React, { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateOptionsFromList } from "@/lib/choice-utils";
import { cn } from "@/lib/utils";
import type { Step } from "@/types";

import type { ChoiceAdvancedConfig, ChoiceOption, DynamicOptionsConfig } from "@/../../shared/types/stepConfigs";


export interface ChoiceBlockProps {
  step: Step;
  value: any;
  onChange: (value: string | string[]) => void;
  readOnly?: boolean;
  context?: Record<string, any>;
}

// Helper for Searchable Dropdown
function SearchableDropdown({
  options,
  value,
  onChange,
  disabled,
  placeholder = "Select an option..."
}: {
  options: ChoiceOption[],
  value: string,
  onChange: (val: string) => void,
  disabled?: boolean,
  placeholder?: string
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal text-left"
          disabled={disabled}
        >
          {value
            ? options.find((option) => (option.alias || option.id) === value)?.label
            : <span className="text-muted-foreground">{placeholder}</span>}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No option found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.alias || option.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      (option.alias || option.id) === value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ChoiceBlockRenderer({ step, value, onChange, readOnly, context }: ChoiceBlockProps) {
  // -------------------------------------------------------------------------
  // Parse configuration
  // -------------------------------------------------------------------------
  let displayMode: "radio" | "dropdown" | "multiple" = "radio";
  let allowMultiple = false;
  let isSearchable = false;
  const [options, setOptions] = useState<ChoiceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Extract options from step config
  // -------------------------------------------------------------------------
  useEffect(() => {
    async function loadOptions() {
      setLoading(true);
      setError(null);

      try {
        // Legacy radio type
        if (step.type === "radio") {
          displayMode = "radio";
          allowMultiple = false;

          const legacyOptions = (step.config)?.options || (step.options)?.options || [];

          // Handle both string[] and {id,label}[] formats
          if (Array.isArray(legacyOptions)) {
            const opts = legacyOptions.map((opt: any, idx: number) => {
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
            setOptions(opts);
          }
        }

        // Legacy multiple_choice type
        else if (step.type === "multiple_choice") {
          displayMode = "multiple";
          allowMultiple = true;

          const legacyOptions = (step.config)?.options || (step.options)?.options || [];

          if (Array.isArray(legacyOptions)) {
            const opts = legacyOptions.map((opt: any, idx: number) => {
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
            setOptions(opts);
          }
        }

        // Advanced choice type
        else if (step.type === "choice") {
          const config = step.config as ChoiceAdvancedConfig;
          displayMode = config?.display || "radio";
          allowMultiple = config?.allowMultiple ?? false;

          const configOptions = config?.options;

          // Determine if dynamic
          const isDynamic = configOptions && typeof configOptions === 'object' && 'type' in configOptions;

          if (isDynamic) {
            const dynamicConfig = configOptions;

            // Static options
            if (dynamicConfig.type === 'static') {
              const opts = dynamicConfig.options || [];
              setOptions(opts.map(opt => ({
                ...opt,
                alias: opt.alias || opt.id,
              })));
            }

            // From List Variable (with full transform support)
            else if (dynamicConfig.type === 'list') {
              const { listVariable } = dynamicConfig;

              if (context && listVariable && context[listVariable]) {
                const newOptions = generateOptionsFromList(context[listVariable], dynamicConfig, context);
                setOptions(newOptions);
              } else {
                // If not found, it might be loading or empty.
                if (options.length > 0) { setOptions([]); }
              }
            }

            // From Table Column (convenience path)
            else if (dynamicConfig.type === 'table_column') {
              const { dataSourceId, tableId, columnId, labelColumnId, limit = 100 } = dynamicConfig;

              // Fetch table rows
              try {
                const response = await fetch(
                  `/api/tables/${tableId}/rows?limit=${limit}`,
                  {
                    credentials: 'include',
                  }
                );

                if (!response.ok) {
                  throw new Error(`Failed to fetch table data: ${response.statusText}`);
                }

                const data = await response.json();
                const rows = data.rows || [];

                const labelCol = labelColumnId || columnId;

                const opts = rows.map((row: any, idx: number) => ({
                  id: row.data[columnId] || `opt-${idx}`,
                  label: String(row.data[labelCol] || row.data[columnId] || `Option ${idx}`),
                  alias: String(row.data[columnId] || `opt-${idx}`)
                }));

                setOptions(opts);
              } catch (err: any) {
                console.error('[ChoiceBlock] Error loading table column:', err);
                setError(err.message || 'Failed to load options from table');
                setOptions([]);
              }
            }
          } else {
            // Legacy: static array
            const opts = (configOptions) || [];
            setOptions(opts.map(opt => ({
              ...opt,
              alias: opt.alias || opt.id,
            })));
          }
        }
      } catch (err: any) {
        console.error('[ChoiceBlock] Error loading options:', err);
        setError(err.message || 'Failed to load options');
        setOptions([]);
      } finally {
        setLoading(false);
      }
    }

    loadOptions();
  }, [step, context]);

  // Get display mode from config
  if (step.type === "choice") {
    const config = step.config as ChoiceAdvancedConfig;
    displayMode = config?.display || "radio";
    allowMultiple = config?.allowMultiple ?? false;
    isSearchable = config?.searchable ?? false;
  }

  // -------------------------------------------------------------------------
  // Value handling
  // -------------------------------------------------------------------------
  const currentValue = value || (allowMultiple ? [] : "");

  // -------------------------------------------------------------------------
  // Loading & Error States
  // -------------------------------------------------------------------------
  if (loading) {
    return <div className="text-sm text-muted-foreground animate-pulse">Loading options...</div>;
  }

  if (error) {
    return (
      <div className="text-sm text-destructive border border-destructive/20 bg-destructive/5 rounded p-2">
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
    if (isSearchable) {
      return (
        <SearchableDropdown
          options={options}
          value={currentValue as string}
          onChange={(val) => { if (!readOnly) onChange(val); }}
          disabled={readOnly}
        />
      );
    }

    return (
      <Select
        value={currentValue as string}
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
      if (readOnly) { return; }

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
