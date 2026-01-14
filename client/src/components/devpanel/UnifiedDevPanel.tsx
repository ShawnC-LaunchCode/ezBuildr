/**
 * UnifiedDevPanel Component
 * Shared development panel for both Builder and Preview modes
 * Currently lists variables, with future extensibility for other tools.
 */

import { ChevronLeft, ChevronRight, Code2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

interface UnifiedDevPanelProps {
    workflowId: string;
    isOpen: boolean;
    onToggle: () => void;
    className?: string;
    children: ReactNode;
}

export function UnifiedDevPanel({
    workflowId,
    isOpen,
    onToggle,
    className,
    children
}: UnifiedDevPanelProps) {

    return (
        <div
            className={cn(
                "flex h-full border-l bg-sidebar transition-all duration-300",
                isOpen ? "w-[360px]" : "w-0",
                className
            )}
        >
            {/* Collapse/Expand Button */}
            <div className="relative">
                <Button
                    size="icon"
                    variant="ghost"
                    className="absolute -left-8 top-3 h-8 w-8 z-10 bg-sidebar border shadow-sm rounded-l-md rounded-r-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    onClick={onToggle}
                    title={isOpen ? "Collapse Dev Panel" : "Expand Dev Panel"}
                >
                    {isOpen ? (
                        <ChevronRight className="h-4 w-4" />
                    ) : (
                        <ChevronLeft className="h-4 w-4" />
                    )}
                </Button>
            </div>

            {/* Panel Content */}
            {isOpen && (
                <div className="flex flex-col w-full overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 h-10 border-b bg-sidebar-accent/20">
                        <div className="flex items-center gap-2">
                            <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">Dev Tools</h3>
                        </div>
                    </div>

                    {/* Variables Content */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
}
