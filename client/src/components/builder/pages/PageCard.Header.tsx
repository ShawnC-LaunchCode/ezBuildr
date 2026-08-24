import { DraggableAttributes } from "@dnd-kit/core";
import { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import {
    ChevronDown,
    ChevronRight,
    Copy,
    EyeOff,
    FileText,
    GripVertical,
    Settings,
    Trash2,
} from "lucide-react";
import React from "react";

import { LogicIndicator } from "@/components/logic";
import { AutoExpandTextarea } from "@/components/ui/auto-expand-textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ApiPage } from "@/lib/vault-api";

import type { ConditionExpression } from "@shared/types/conditions";

interface PageCardHeaderProps {
    page: ApiPage;
    mode: string;
    index: number | undefined;
    total: number | undefined;
    isFinalDocumentsPage: boolean;
    isCollapsed: boolean;
    attributes: DraggableAttributes;
    listeners: SyntheticListenerMap | undefined;
    onToggleCollapse: (e: React.MouseEvent) => void;
    onTitleChange: (val: string) => void;
    flushTitle?: () => void;
    localTitle?: string;
    onDescriptionChange: (val: string) => void;
    flushDescription?: () => void;
    localDescription?: string;
    onSelectPage: () => void;
    onOpenLogicSheet: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}

export function PageCardHeader({
    page,
    mode,
    index,
    total,
    isFinalDocumentsPage,
    isCollapsed,
    attributes,
    listeners,
    onToggleCollapse,
    onTitleChange,
    flushTitle,
    localTitle,
    onDescriptionChange,
    flushDescription,
    localDescription,
    onSelectPage,
    onOpenLogicSheet,
    onDuplicate,
    onDelete,
}: PageCardHeaderProps) {
    return (
        <CardHeader className="pb-3">
            <div className="flex items-start gap-2">
                {/* Drag handle for page reordering */}
                <button
                    className="cursor-grab rounded p-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:cursor-grabbing"
                    aria-label={`Reorder page ${page.title}`}
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                </button>

                {/* Collapse/Expand button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 mt-1"
                    onClick={onToggleCollapse}
                >
                    {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                    ) : (
                        <ChevronDown className="h-4 w-4" />
                    )}
                </Button>

                {/* Page title and description */}
                <div className="flex-1 space-y-1">
                    {mode === "easy" &&
                        typeof index === "number" &&
                        typeof total === "number" &&
                        !isFinalDocumentsPage && (
                            <div className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest pl-1 select-none">
                                Page {index + 1} of {total}
                            </div>
                        )}
                    <div className="flex items-center gap-2">
                        <Input
                            value={localTitle ?? page.title}
                            onChange={(e) => {
                                onTitleChange(e.target.value);
                            }}
                            onBlur={flushTitle}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    flushTitle?.();
                                    e.currentTarget.blur();
                                }
                            }}
                            className="font-semibold text-base border-none shadow-none px-0 focus-visible:ring-0 flex-1"
                            placeholder="Page title"
                        />
                        {isFinalDocumentsPage && (
                            <Badge variant="secondary" className="text-xs px-2 py-1">
                                <FileText className="h-3 w-3 mr-1" />
                                Final Documents Block
                            </Badge>
                        )}
                        <LogicIndicator
                            visibleIf={page.visibleIf as ConditionExpression | undefined}
                            variant="badge"
                            size="sm"
                            elementType="page"
                        />
                    </div>
                    <AutoExpandTextarea
                        value={localDescription ?? page.description ?? ""}
                        onChange={(e) => {
                            onDescriptionChange(e.target.value);
                        }}
                        onBlur={flushDescription}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                flushDescription?.();
                                // Let the AutoExpandTextarea handle its own blur or keep focus
                            }
                        }}
                        className="text-sm text-muted-foreground border-none shadow-none px-0 focus-visible:ring-0 min-h-0"
                        placeholder="Page description (optional)"
                        minRows={1}
                        maxRows={4}
                    />
                </div>

                {/* Page actions */}
                <div className="flex items-center gap-1">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" title="Page settings">
                                <Settings className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onClick={() => {
                                    onSelectPage();
                                }}
                            >
                                <Settings className="h-4 w-4 mr-2" />
                                Page Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => {
                                    onOpenLogicSheet();
                                }}
                            >
                                <EyeOff className="h-4 w-4 mr-2" />
                                Visibility Logic
                                {!!page.visibleIf && (
                                    <span className="ml-auto text-xs text-amber-600">Active</span>
                                )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => {
                                    onDuplicate();
                                }}
                            >
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate Page
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => {
                                    onDelete();
                                }}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Page
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </CardHeader>
    );
}
