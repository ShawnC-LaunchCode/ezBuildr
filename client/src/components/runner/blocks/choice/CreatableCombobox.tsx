/**
 * CreatableCombobox — a searchable dropdown that also accepts a new answer.
 *
 * This is what `display: 'combobox'` renders. The difference from the plain
 * searchable dropdown it replaces: when a respondent's answer isn't in the
 * author's list, they can enter it instead of being stuck.
 *
 * A typed answer is stored verbatim as this run's value and is NOT written
 * back into the question's options — one respondent's answer never edits the
 * workflow for everybody else.
 */

import { Check, ChevronsUpDown, Plus } from "lucide-react";
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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { ChoiceOption } from "@shared/types/stepConfigs";

interface CreatableComboboxProps {
    options: ChoiceOption[];
    value: string;
    onChange: (val: string) => void;
    disabled?: boolean;
    placeholder?: string;
    ariaDescribedBy?: string;
    ariaRequired?: boolean;
    ariaInvalid?: boolean;
}

const optionValue = (option: ChoiceOption): string => option.alias ?? option.id;

export function CreatableCombobox({
    options,
    value,
    onChange,
    disabled,
    placeholder = "Select or type an answer...",
    ariaDescribedBy,
    ariaRequired,
    ariaInvalid,
}: CreatableComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const selected = options.find((option) => optionValue(option) === value);
    // A stored value with no matching option is an answer the respondent typed
    // on an earlier visit; show it back to them rather than an empty trigger.
    const isCustomValue = selected === undefined && value !== "";

    const trimmed = query.trim();

    const filtered = useMemo(() => {
        if (trimmed === "") { return options; }
        const q = trimmed.toLowerCase();
        return options.filter((option) => option.label.toLowerCase().includes(q));
    }, [options, trimmed]);

    // Only offer to create when the text isn't already an option — matching on
    // both label and stored value so "Other" typed verbatim just selects it.
    const canCreate =
        trimmed !== "" &&
        !options.some(
            (option) =>
                option.label.toLowerCase() === trimmed.toLowerCase() ||
                optionValue(option).toLowerCase() === trimmed.toLowerCase()
        );

    const commit = (next: string) => {
        onChange(next);
        setQuery("");
        setOpen(false);
    };

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) { setQuery(""); }
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-describedby={ariaDescribedBy}
                    aria-required={ariaRequired === true ? "true" : undefined}
                    aria-invalid={ariaInvalid === true ? "true" : undefined}
                    className="w-full justify-between text-left font-normal"
                    disabled={disabled}
                >
                    {selected !== undefined && <span className="truncate">{selected.label}</span>}
                    {isCustomValue && (
                        <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate">{value}</span>
                            <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                                custom
                            </span>
                        </span>
                    )}
                    {selected === undefined && !isCustomValue && (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                {/* Filtering is done above so the create row can react to the
                    exact query; cmdk's own matching would hide it. */}
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Search or type an answer..."
                        value={query}
                        onValueChange={setQuery}
                    />
                    <CommandList>
                        {!canCreate && filtered.length === 0 && (
                            <CommandEmpty>No option found.</CommandEmpty>
                        )}
                        {filtered.length > 0 && (
                            <CommandGroup>
                                {filtered.map((option) => (
                                    <CommandItem
                                        key={option.id}
                                        value={optionValue(option)}
                                        onSelect={() => commit(optionValue(option))}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                optionValue(option) === value ? "opacity-100" : "opacity-0"
                                            )}
                                            aria-hidden="true"
                                        />
                                        {option.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                        {canCreate && (
                            <CommandGroup>
                                <CommandItem value={`__create__${trimmed}`} onSelect={() => commit(trimmed)}>
                                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                                    <span className="truncate">
                                        Use &quot;<span className="font-medium">{trimmed}</span>&quot;
                                    </span>
                                </CommandItem>
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
