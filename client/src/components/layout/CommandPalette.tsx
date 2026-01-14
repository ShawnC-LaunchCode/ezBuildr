
import {
    Calculator,
    Calendar,
    CreditCard,
    Settings,
    Smile,
    User,
    LayoutDashboard,
    Plus,
    Play,
    Save,
    Code2,
    Sparkles,
    FileText,
    Search
} from "lucide-react";
import * as React from "react";
import { Link, useLocation } from "wouter";

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
import { useWorkflowMode, useSetWorkflowMode } from "@/lib/vault-hooks";
import { useWorkflowBuilder } from "@/store/workflow-builder";

export function CommandPalette() {
    const [open, setOpen] = React.useState(false);
    const [, navigate] = useLocation();
    const { mode: builderMode } = useWorkflowBuilder();

    // Use location to determine context (some actions only valid in builder)
    const isBuilder = window.location.pathname.includes("/builder");
    const workflowIdMatch = window.location.pathname.match(/\/workflows\/([^\/]+)\/builder/);
    const workflowId = workflowIdMatch ? workflowIdMatch[1] : null;

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, []);

    const runCommand = React.useCallback((command: () => unknown) => {
        setOpen(false);
        command();
    }, []);

    return (
        <>
            {/* Hidden hint for accessibility/discovery */}
            <div className="hidden">
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
                            <CommandItem onSelect={() => runCommand(() => window.dispatchEvent(new CustomEvent('toggle-advanced-mode')))}>
                                {builderMode === 'easy' ? <Code2 className="mr-2 h-4 w-4" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                <span>{builderMode === 'easy' ? "Switch to Advanced Mode" : "Switch to Easy Mode"}</span>
                            </CommandItem>
                        </CommandGroup>
                    )}

                    <CommandGroup heading="Navigation">
                        <CommandItem onSelect={() => runCommand(() => navigate("/workflows"))}>
                            <LayoutDashboard className="mr-2 h-4 w-4" />
                            <span>Go to Dashboard</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => navigate("/workflows/new"))}>
                            <Plus className="mr-2 h-4 w-4" />
                            <span>Create New Workflow</span>
                        </CommandItem>
                        <CommandItem onSelect={() => runCommand(() => navigate("/settings"))}>
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
