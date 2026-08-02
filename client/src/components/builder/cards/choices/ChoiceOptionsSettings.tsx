import { ArrowDown, ArrowUp, Info } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import type { ChoiceAdvancedConfig, ChoiceOption } from "@shared/types/stepConfigs";

import { StaticOptionsEditor } from "../StaticOptionsEditor";

interface ChoiceOptionsSettingsProps {
  config: ChoiceAdvancedConfig | null | undefined;
  onChange: (config: ChoiceAdvancedConfig) => void;
}

function staticOptionsFrom(config: ChoiceAdvancedConfig | null | undefined): ChoiceOption[] | null {
  if (!config) {
    return [];
  }
  if (Array.isArray(config.options)) {
    return config.options;
  }
  return config.options.type === "static" ? config.options.options : null;
}

function withStaticOptions(
  config: ChoiceAdvancedConfig | null | undefined,
  options: ChoiceOption[]
): ChoiceAdvancedConfig {
  return {
    ...config,
    display: config?.display ?? "dropdown",
    allowMultiple: config?.allowMultiple ?? false,
    options: { type: "static", options },
  };
}

function nextOption(options: ChoiceOption[]): ChoiceOption {
  const usedIds = new Set(options.map((option) => option.id));
  const usedAliases = new Set(
    options.map((option) => option.alias).filter((alias): alias is string => Boolean(alias))
  );
  let suffix = options.length + 1;
  while (usedIds.has(`opt${suffix}`) || usedAliases.has(`Option ${suffix}`)) {
    suffix += 1;
  }
  const label = `Option ${suffix}`;
  return { id: `opt${suffix}`, label, alias: label };
}

export function ChoiceOptionsSettings({
  config,
  onChange,
}: ChoiceOptionsSettingsProps): JSX.Element {
  const options = staticOptionsFrom(config);

  if (options === null) {
    return <DynamicOptionsUnavailable />;
  }

  return <StaticChoiceOptions config={config} options={options} onChange={onChange} />;
}

function StaticChoiceOptions({
  config,
  options,
  onChange,
}: {
  config: ChoiceAdvancedConfig | null | undefined;
  options: ChoiceOption[];
  onChange: (config: ChoiceAdvancedConfig) => void;
}): JSX.Element {
  const orderSelectId = useId();
  const [selectedOptionId, setSelectedOptionId] = useState(options[0]?.id ?? "");
  const duplicateAliases = useMemo(() => {
    const duplicates = new Set<string>();
    const seen = new Set<string>();
    for (const option of options) {
      // Must match how the consumer derives its lookup key (`StaticOptionsEditor`
      // uses `option.alias ?? option.id`) and how save-time validation in
      // `ChoiceCardEditor` derives it. Falling back to `label` here instead
      // silently breaks highlighting for any option with no explicit alias, and
      // lets a save be rejected for a duplicate that was never flagged.
      const alias = option.alias ?? option.id;
      if (seen.has(alias)) {
        duplicates.add(alias);
      } else {
        seen.add(alias);
      }
    }
    return duplicates;
  }, [options]);

  useEffect(() => {
    if (!options.some((option) => option.id === selectedOptionId)) {
      setSelectedOptionId(options[0]?.id ?? "");
    }
  }, [options, selectedOptionId]);

  const updateOptions = (nextOptions: ChoiceOption[]) => {
    onChange(withStaticOptions(config, nextOptions));
  };

  const handleUpdate = (index: number, updates: Partial<ChoiceOption>) => {
    const nextOptions = [...options];
    nextOptions[index] = { ...nextOptions[index], ...updates };
    updateOptions(nextOptions);
  };

  const handleDelete = (index: number) => {
    updateOptions(options.filter((_, optionIndex) => optionIndex !== index));
  };

  const handleMove = (offset: -1 | 1) => {
    const fromIndex = options.findIndex((option) => option.id === selectedOptionId);
    const toIndex = fromIndex + offset;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= options.length) {
      return;
    }
    const nextOptions = [...options];
    const [moved] = nextOptions.splice(fromIndex, 1);
    nextOptions.splice(toIndex, 0, moved);
    updateOptions(nextOptions);
  };

  const selectedIndex = options.findIndex((option) => option.id === selectedOptionId);

  return (
    <div className="space-y-3">
      {options.length > 1 && (
        <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
          <Label htmlFor={orderSelectId} className="text-xs font-medium">
            Option order
          </Label>
          <div className="flex gap-2">
            <select
              id={orderSelectId}
              value={selectedOptionId}
              onChange={(event) => setSelectedOptionId(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label || "Untitled option"}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Move selected option up"
              disabled={selectedIndex <= 0}
              onClick={() => handleMove(-1)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Move selected option down"
              disabled={selectedIndex < 0 || selectedIndex === options.length - 1}
              onClick={() => handleMove(1)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Choose an option, then move it to set the order respondents see.
          </p>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-sm font-medium">Manual options</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Display text is saved as the answer by default. Unlink a row only when its saved value
          needs to be different.
        </p>
      </div>

      <div className="[&_.cursor-grab]:hidden">
        <StaticOptionsEditor
          options={options}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={() => updateOptions([...options, nextOption(options)])}
          duplicateAliases={duplicateAliases}
        />
      </div>
    </div>
  );
}

function DynamicOptionsUnavailable(): JSX.Element {
  return (
    <div role="note" className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium">Dynamic options aren&apos;t available for list fields</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Use manual options here. Choices powered by tables or other lists aren&apos;t supported
          inside an individual list item yet.
        </p>
      </div>
    </div>
  );
}
