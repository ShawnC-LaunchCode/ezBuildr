
import { Trash2 } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { StepGuidance } from "./StepGuidance";


interface StepTitleRowProps {
    step: { id: string; title: string };
    mode: string;
    isGuidanceDismissed: boolean;
    onDismissGuidance: () => void;
    onTitleChange: (val: string) => void;
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
    onDelete,
    onEnterNext,
    autoFocus,
    isExpanded
}: StepTitleRowProps) {
    const titleInputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="flex items-center gap-2">
            <div className="flex-1">
                <div className="relative flex-1">
                    <Input
                        id={`question-title-${step.id}`}
                        name={`question-title-${step.id}`}
                        ref={titleInputRef}
                        value={step.title}
                        onChange={(e) => onTitleChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
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

            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                onClick={onDelete}
                tabIndex={0}
                aria-label={`Delete question ${step.title}`}
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );
}
