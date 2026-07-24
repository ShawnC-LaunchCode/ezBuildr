
import { Copy, MoreVertical, Trash2 } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { StepGuidance } from "./StepGuidance";
import { useDebouncedFieldMutation } from "@/hooks/useDebouncedFieldMutation";


interface StepTitleRowProps {
    step: { id: string; title: string };
    mode: string;
    isGuidanceDismissed: boolean;
    onDismissGuidance: () => void;
    onTitleChange: (val: string) => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onEnterNext?: () => void;
    autoFocus?: boolean;
    isExpanded?: boolean;
}

export function StepTitleRow({
    step,
    mode,
    isGuidanceDismissed,
    onDismissGuidance,
    onTitleChange,
    onDuplicate,
    onDelete,
    onEnterNext,
    autoFocus,
    isExpanded
}: StepTitleRowProps) {
    const titleInputRef = useRef<HTMLInputElement>(null);

    const { localValue: title, onChange: setLocalTitle, onBlur: flushTitle } = useDebouncedFieldMutation(
        step.title,
        onTitleChange
    );

    return (
        <div className="flex items-center gap-2">
            <div className="flex-1">
                <div className="relative flex-1">
                    <Input
                        id={`question-title-${step.id}`}
                        name={`question-title-${step.id}`}
                        ref={titleInputRef}
                        value={title}
                        onChange={(e) => setLocalTitle(e.target.value)}
                        onBlur={flushTitle}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                flushTitle();
                                e.currentTarget.blur();
                                onEnterNext?.();
                            }
                        }}
                        placeholder="Question text"
                        aria-label="Question text"
                        className={cn(
                            "font-medium text-sm transition-all duration-300",
                            step.title
                                ? "border-transparent hover:border-input focus:border-input"
                                : mode === 'easy' && !isGuidanceDismissed
                                    ? "border-amber-300 bg-amber-50/30 focus-visible:ring-amber-400 placeholder:text-amber-500/50"
                                    : "border-transparent hover:border-input focus:border-input"
                        )}
                        autoFocus={autoFocus && isExpanded}
                    />
                    <StepGuidance
                        mode={mode}
                        isDismissed={isGuidanceDismissed}
                        onDismiss={onDismissGuidance}
                        show={!step.title}
                    />
                </div>
            </div>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground shrink-0"
                        tabIndex={0}
                        aria-label={`Question actions for ${step.title || "untitled question"}`}
                    >
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onDuplicate}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={onDelete}
                        className="text-destructive focus:text-destructive"
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
