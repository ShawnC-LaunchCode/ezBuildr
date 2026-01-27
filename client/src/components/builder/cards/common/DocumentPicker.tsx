
import { Check, ChevronsUpDown, FileText } from "lucide-react";
import React from "react";

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
import { useTemplates } from "@/lib/vault-hooks";

interface DocumentPickerProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function DocumentPicker({
    value,
    onChange,
    placeholder = "Select a document...",
    disabled = false
}: DocumentPickerProps) {
    const [open, setOpen] = React.useState(false);
    const { data: templates, isLoading } = useTemplates();

    const selectedTemplate = templates?.find((template) => template.id === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                    disabled={disabled || isLoading}
                >
                    {selectedTemplate ? (
                        <span className="flex items-center truncate">
                            <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                            {selectedTemplate.name}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">{isLoading ? "Loading templates..." : placeholder}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search templates..." />
                    <CommandList>
                        <CommandEmpty>No templates found.</CommandEmpty>
                        <CommandGroup>
                            {templates?.map((template) => (
                                <CommandItem
                                    key={template.id}
                                    value={template.name} // Search by name
                                    onSelect={() => {
                                        onChange(template.id);
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            value === template.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col">
                                        <span>{template.name}</span>
                                        {template.description && (
                                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                {template.description}
                                            </span>
                                        )}
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
