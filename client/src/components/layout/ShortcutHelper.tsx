
import { Keyboard } from "lucide-react";
import * as React from "react";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

export function ShortcutHelper() {
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            // Toggle on Cmd+/ (or Ctrl+/)
            if (e.key === "/" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((open) => !open);
            }

            // Listen for custom event from Command Palette
            if (e instanceof CustomEvent && e.type === 'open-shortcut-help') {
                setOpen(true);
            }
        };

        // Add event listener for custom event
        const handleCustomOpen = () => setOpen(true);
        window.addEventListener('open-shortcut-help', handleCustomOpen);

        document.addEventListener("keydown", down);
        return () => {
            document.removeEventListener("keydown", down);
            window.removeEventListener('open-shortcut-help', handleCustomOpen);
        }
    }, []);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Keyboard className="w-5 h-5 text-indigo-500" />
                        Keyboard Shortcuts
                    </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <ShortcutGroup title="General">
                        <ShortcutItem keys={["⌘", "K"]} description="Open Command Palette" />
                        <ShortcutItem keys={["⌘", "/"]} description="Show this help" />
                    </ShortcutGroup>

                    <ShortcutGroup title="Builder">
                        <ShortcutItem keys={["⌘", "S"]} description="Save Workflow" />
                        <ShortcutItem keys={["⌘", "Enter"]} description="Run Preview" />
                        <ShortcutItem keys={["⌘", "D"]} description="Duplicate Selected Block" />
                        <ShortcutItem keys={["⌫"]} description="Delete Selected Block" />
                    </ShortcutGroup>

                    <ShortcutGroup title="Navigation">
                        <ShortcutItem keys={["↑", "↓"]} description="Navigate List" />
                        <ShortcutItem keys={["Enter"]} description="Select / Expand" />
                    </ShortcutGroup>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ShortcutGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-[10px]">{title}</h4>
            <div className="space-y-1">{children}</div>
        </div>
    );
}

function ShortcutItem({ keys, description }: { keys: string[]; description: string }) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-foreground">{description}</span>
            <div className="flex gap-1">
                {keys.map((k, i) => (
                    <kbd
                        key={i}
                        className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
                    >
                        {k}
                    </kbd>
                ))}
            </div>
        </div>
    );
}
