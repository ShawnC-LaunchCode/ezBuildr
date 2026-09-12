
import { ChevronDown, ChevronRight, GripVertical, FileCheck, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import { type ApiPage } from "@/lib/vault-api";
import { useWorkflowBuilder } from "@/store/workflow-builder";



interface PageItemHeaderProps {
    page: ApiPage;
    isExpanded: boolean;
    onToggle: () => void;
    onEditPage: () => void;
    isFinalPage: boolean;
    isPageConditional: boolean;
    nested?: boolean;
}

export function PageItemHeader({
    page,
    isExpanded,
    onToggle,
    onEditPage,
    isFinalPage,
    isPageConditional,
    nested = false,
}: PageItemHeaderProps) {
    const { selection, selectPage } = useWorkflowBuilder();
    const isSelected = selection?.type === "page" && selection.id === page.id;

    return (
        <div
            className={cn(
                "flex items-center rounded-md hover:bg-sidebar-accent/50 cursor-pointer group transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
                nested ? "gap-1 px-1 py-1" : "gap-2 p-2",
                isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            )}
            onClick={() => { selectPage(page.id); }}
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectPage(page.id);
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
            <GripVertical className={cn("text-muted-foreground", nested ? "size-3" : "size-4")} />
            <span className={cn("flex-1 truncate", nested ? "text-xs" : "text-sm")}>{page.title}</span>
            {isFinalPage && (
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
                        onEditPage();
                    }}
                    title="Page Settings"
                >
                    <Settings className="h-3 w-3 text-muted-foreground" />
                </Button>
            </div>

        </div>
    );
}
