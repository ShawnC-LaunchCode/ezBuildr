import { FileCheck, FileText, FolderPlus, Plus, Scissors, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createElement } from "react";

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
    onAddSection: () => void;
    /** Panel is too narrow for labels — drop to icons. */
    compact?: boolean;
}

interface HeaderActionProps {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    compact: boolean;
    className?: string;
}

function HeaderAction({ label, icon, onClick, compact, className }: HeaderActionProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="outline"
                    size={compact ? "icon" : "sm"}
                    aria-label={compact ? label : undefined}
                    className={cn("border-dashed", compact ? "size-8" : "w-full", className)}
                    onClick={onClick}
                >
                    {createElement(icon, { className: compact ? "size-4" : "mr-2 size-3.5" })}
                    {!compact && label}
                </Button>
            </TooltipTrigger>
            {compact && <TooltipContent side="right">{label}</TooltipContent>}
        </Tooltip>
    );
}

export function SidebarHeader({
    onAddPage,
    onAddFinalDocs,
    onAiAssist,
    onAddSnip,
    onAddSection,
    compact = false,
}: SidebarHeaderProps) {
    // Same four actions, same order, same colours in both layouts — only the
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

            <HeaderAction label="Add Section" icon={FolderPlus} onClick={onAddSection} compact={compact} />

            {/* AI Assistant Button */}
            <HeaderAction
                label="Edit with AI"
                icon={Sparkles}
                onClick={onAiAssist}
                compact={compact}
                className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
            />

            {/* Add Snip Button — Scissors rather than a second Plus, which was
                indistinguishable from Add Page once the labels came off. */}
            <HeaderAction
                label="Add Snip"
                icon={Scissors}
                onClick={onAddSnip}
                compact={compact}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            />
        </div>
    );
}
