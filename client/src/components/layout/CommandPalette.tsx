import {
    Calculator,
    LayoutDashboard,
    Play,
    Plus,
    Save,
    Settings,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command";

export function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [location, setLocation] = useLocation();

    // Use location to determine context (some actions only valid in builder)
    const isBuilder = location.includes("/builder");

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((currentOpen) => !currentOpen);
            }
        };
        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    const runCommand = useCallback((command: () => unknown) => {
        setOpen(false);
        command();
    }, []);

    return (
        <>
            {/* Hidden hint for accessibility/discovery */}
            <div className="hidden" aria-hidden="true">
                Press <kbd>⌘K</kbd> to open command palette
            </div>
            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput placeholder="Type a command or search..." />
                <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    {isBuilder && (
                        <CommandGroup heading="Builder Actions">
                            <CommandItem onSelect={() => runCommand(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true })))}>
                                <Save className="mr-2 h-4 w-4" />
                                <span>Save Workflow</span>
                                <CommandShortcut>⌘S</CommandShortcut>
                            </CommandItem>
                            <CommandItem onSelect={() => runCommand(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true })))}>
                                <Play className="mr-2 h-4 w-4" />
                                <span>Run Preview</span>
                                <CommandShortcut>⌘Enter</CommandShortcut>
                            </CommandItem>
                        </CommandGroup>
                    )}
                    <CommandGroup heading="Navigation">
                        <CommandItem onSelect={() => runCommand(() => setLocation("/workflows"))}>
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            <span>Go to Dashboard</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => setLocation("/workflows/new"))}>
                            <Plus className="mr-2 h-4 w-4" />
                            <span>Create New Workflow</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => setLocation("/settings"))}>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Settings</span>
                        </CommandItem>
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading="Help">
                        <CommandItem onSelect={() => runCommand(() => window.dispatchEvent(new CustomEvent('open-shortcut-help')))}>
                            <Calculator className="mr-2 h-4 w-4" />
                            <span>Keyboard Shortcuts</span>
                            <CommandShortcut>⌘/</CommandShortcut>
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </CommandDialog>
        </>
    );
}