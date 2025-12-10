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
                "flex h-full border-l bg-background transition-all duration-300",
                isOpen ? "w-[360px]" : "w-0",
                className
            )}
        >
            {/* Collapse/Expand Button */}
            <div className="relative">
                <Button
                    size="icon"
                    variant="ghost"
                    className="absolute -left-8 top-3 h-8 w-8 z-10 bg-background border shadow-sm"
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
                    <div className="flex items-center justify-between p-3 border-b h-14 bg-muted/20">
                        <div className="flex items-center gap-2">
                            <Code2 className="h-4 w-4 text-primary" />
                            <h3 className="font-semibold text-sm">Dev Tools</h3>
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
