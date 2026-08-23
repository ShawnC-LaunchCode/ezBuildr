import { FileCheck, FileText, Plus, Scissors, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UI_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface SidebarHeaderProps {
    onAddPage: () => void;
    onAddFinalDocs: () => void;
    onAiAssist: () => void;
    onAddSnip: () => void;
    /** Panel is too narrow for labels — drop to icons. */
    compact?: boolean;
}

export function SidebarHeader({
    onAddPage,
    onAddFinalDocs,
    onAiAssist,
    onAddSnip,
    compact = false,
}: SidebarHeaderProps) {
    // Same three actions, same order, same colours in both layouts — only the
    // label disappears, so the panel doesn't reshuffle as you drag it.
    return (
        <div
            className={cn(
                "border-b",
                compact ? "flex flex-col items-center gap-1.5 p-2" : "space-y-2 p-4",
            )}
        >
            <DropdownMenu>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size={compact ? "icon" : "sm"}
                                className={compact ? "size-8" : "w-full"}
                                aria-label={compact ? UI_LABELS.ADD_PAGE : undefined}
                            >
                                <Plus className={compact ? "size-4" : "mr-2 size-4"} />
                                {!compact && UI_LABELS.ADD_PAGE}
                            </Button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    {compact && <TooltipContent side="right">{UI_LABELS.ADD_PAGE}</TooltipContent>}
                </Tooltip>
                <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem onClick={onAddPage}>
                        <FileText className="w-4 h-4 mr-2" />
                        Regular Page
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onAddFinalDocs}>
                        <FileCheck className="w-4 h-4 mr-2" />
                        Final Documents Page
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* AI Assistant Button */}
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size={compact ? "icon" : "sm"}
                        aria-label={compact ? "Edit with AI" : undefined}
                        className={cn(
                            "border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800",
                            compact ? "size-8" : "w-full",
                        )}
                        onClick={onAiAssist}
                    >
                        <Sparkles className={compact ? "size-4" : "mr-2 size-3"} />
                        {!compact && "Edit with AI"}
                    </Button>
                </TooltipTrigger>
                {compact && <TooltipContent side="right">Edit with AI</TooltipContent>}
            </Tooltip>

            {/* Add Snip Button — Scissors rather than a second Plus, which was
                indistinguishable from Add Page once the labels came off. */}
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="outline"
                        size={compact ? "icon" : "sm"}
                        aria-label={compact ? "Add Snip" : undefined}
                        className={cn(
                            "border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800",
                            compact ? "size-8" : "w-full",
                        )}
                        onClick={onAddSnip}
                    >
                        <Scissors className={compact ? "size-4" : "mr-2 size-3"} />
                        {!compact && "Add Snip"}
                    </Button>
                </TooltipTrigger>
                {compact && <TooltipContent side="right">Add Snip</TooltipContent>}
            </Tooltip>
        </div>
    );
}
