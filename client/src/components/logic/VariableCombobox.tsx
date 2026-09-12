/**
 * VariableCombobox - Searchable, keyboard-navigable operand picker
 *
 * Shared by ConditionRow's variable picker and ConditionValueInput's
 * variable-reference mode (LU-4). Replaces the plain Radix `Select` used by
 * both, which becomes unusable once a workflow has more than a few dozen
 * aliases. Built from the existing `Command`/`Popover` primitives — the same
 * combobox pattern already used by `DocumentPicker` — rather than adding a
 * new dependency.
 *
 * Preserves the page grouping the `Select` version had (`SelectGroup`/
 * `SelectLabel`) via `CommandGroup`'s `heading`, and filters on both alias
 * and label by passing both as cmdk `keywords`.
 */
import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { VariableInfo } from "@shared/types/conditions";

interface VariablePage {
  pageId: string;
  title: string;
  variables: VariableInfo[];
}

function groupByPage(variables: VariableInfo[]): VariablePage[] {
  const pages: VariablePage[] = [];
  const byPageId = new Map<string, VariablePage>();

  for (const variable of variables) {
    const existing = byPageId.get(variable.pageId);
    if (existing) {
      existing.variables.push(variable);
      continue;
    }
    const page: VariablePage = {
      pageId: variable.pageId,
      title: variable.pageTitle,
      variables: [variable],
    };
    byPageId.set(variable.pageId, page);
    pages.push(page);
  }

  return pages;
}

interface VariableComboboxProps {
  variables: VariableInfo[];
  /** Currently selected operand value (alias, falling back to id). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  triggerClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export function VariableCombobox({
  variables,
  value,
  onChange,
  placeholder = "Select variable...",
  emptyText = "No matching variables.",
  searchPlaceholder = "Search variables...",
  triggerClassName,
  ariaLabel,
  disabled = false,
}: VariableComboboxProps) {
  const [open, setOpen] = useState(false);
  const pages = useMemo(() => groupByPage(variables), [variables]);
  const selected = variables.find((v) => v.id === value || v.alias === value);
  const selectedLabel = selected ? (selected.alias ?? selected.title) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? placeholder}
          disabled={disabled}
          className={cn(
            "h-10 w-[160px] justify-between text-sm font-normal bg-background",
            triggerClassName
          )}
        >
          <span className="truncate">{selectedLabel ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {pages.map((page) => (
              <CommandGroup key={page.pageId} heading={page.title}>
                {page.variables.map((v) => {
                  const itemValue = v.alias ?? v.id;
                  return (
                    <CommandItem
                      key={v.id}
                      value={itemValue}
                      keywords={[v.alias, v.title].filter((k): k is string => Boolean(k))}
                      onSelect={() => {
                        onChange(itemValue);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5",
                          itemValue === value ? "opacity-100" : "opacity-0"
                        )}
                        aria-hidden="true"
                      />
                      <div className="flex flex-col text-left">
                        <span>{v.alias ?? v.title}</span>
                        {v.alias && (
                          <span className="text-[10px] text-muted-foreground">{v.title}</span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
