
import { ChevronDown, ChevronRight, GripVertical, FileCheck, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Mode } from "@/lib/mode";
import { cn } from "@/lib/utils";
import { type ApiSection } from "@/lib/vault-api";
import { useWorkflowBuilder } from "@/store/workflow-builder";

import { SectionLogicMenu } from "./SectionLogicMenu";

interface SectionItemHeaderProps {
    section: ApiSection;
    isExpanded: boolean;
    onToggle: () => void;
    mode: Mode;
    onEditSection: () => void;
    onAddBlock: (type: "write" | "read_table" | "list_tools" | "external_send") => void;
    isFinalSection: boolean;
    isPageConditional: boolean;
}

export function SectionItemHeader({
    section,
    isExpanded,
    onToggle,
    mode,
    onEditSection,
    onAddBlock,
    isFinalSection,
    isPageConditional
}: SectionItemHeaderProps) {
    const { selection, selectSection } = useWorkflowBuilder();
    const isSelected = selection?.type === "section" && selection.id === section.id;

    return (
        <div
            className={cn(
                "flex items-center gap-2 p-2 rounded-md hover:bg-sidebar-accent/50 cursor-pointer group transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
                isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            )}
            onClick={() => { selectSection(section.id); }}
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectSection(section.id);
                }
                if (e.key === 'ArrowRight' && !isExpanded) {
                    onToggle();
                }
                if (e.key === 'ArrowLeft' && isExpanded) {
                    onToggle();
                }
            }}
        >
            <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0"
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
            >
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm truncate">{section.title}</span>
            {isFinalSection && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    <FileCheck className="h-3 w-3 mr-1" />
                    Final
                </Badge>
            )}
            {isPageConditional && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/20 font-medium">
                    Conditional
                </Badge>
            )}
            <div className="flex gap-1 items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                        e.stopPropagation();
                        onEditSection();
                    }}
                    title="Page Settings"
                >
                    <Settings className="h-3 w-3 text-muted-foreground" />
                </Button>
            </div>
            {/* Adding questions deliberately lives on the page card only, so
                there is one obvious place to author a page. The outline is for
                navigating and reordering. */}
            {!isFinalSection && (
                <div className={cn(
                    "flex gap-1",
                    mode === 'easy' ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity"
                )}>
                    <SectionLogicMenu mode={mode} onAddBlock={onAddBlock} />
                </div>
            )}
        </div>
    );
}
