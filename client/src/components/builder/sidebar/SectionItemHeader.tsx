import { ChevronDown, ChevronRight, Folder, FolderOpen, Settings } from "lucide-react";
import type { KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ApiSection } from "@/lib/vault-api";

interface SectionItemHeaderProps {
    section: ApiSection;
    pageCount: number;
    isExpanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
}

export function SectionItemHeader({
    section,
    pageCount,
    isExpanded,
    onToggle,
    onEdit,
}: SectionItemHeaderProps) {
    const handleDisclosureKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "ArrowRight" && !isExpanded) {
            event.preventDefault();
            onToggle();
        }
        if (event.key === "ArrowLeft" && isExpanded) {
            event.preventDefault();
            onToggle();
        }
    };

    return (
        <div className="group grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-1 rounded-md border border-sidebar-border/60 bg-sidebar-accent/20 px-1.5 py-1 transition-colors hover:bg-sidebar-accent/45">
            <Button
                variant="ghost"
                size="icon"
                className="size-6 rounded-sm"
                onClick={onToggle}
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? "Collapse" : "Expand"} Section ${section.title}`}
                onKeyDown={handleDisclosureKeyDown}
            >
                {isExpanded
                    ? <ChevronDown className="size-3.5" aria-hidden="true" />
                    : <ChevronRight className="size-3.5" aria-hidden="true" />}
            </Button>
            <button
                type="button"
                className="flex min-w-0 items-center gap-1.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                onClick={onToggle}
                onKeyDown={handleDisclosureKeyDown}
                aria-expanded={isExpanded}
            >
                {isExpanded
                    ? <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    : <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span className="truncate text-xs font-semibold tracking-tight">{section.title}</span>
                <Badge
                    variant="secondary"
                    className="h-4 min-w-4 shrink-0 justify-center rounded-sm px-1 font-mono text-[9px] tabular-nums"
                    aria-label={`${pageCount} ${pageCount === 1 ? "page" : "pages"}`}
                >
                    {pageCount}
                </Badge>
            </button>
            <Button
                variant="ghost"
                size="icon"
                className={cn(
                    "size-6 rounded-sm text-muted-foreground transition-opacity hover:text-foreground",
                    "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                )}
                onClick={onEdit}
                aria-label={`Section settings: ${section.title}`}
            >
                <Settings className="size-3.5" aria-hidden="true" />
            </Button>
        </div>
    );
}
