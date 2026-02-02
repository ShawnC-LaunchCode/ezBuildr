
import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface StepGuidanceProps {
    mode: string;
    isDismissed: boolean;
    onDismiss: () => void;
    show: boolean;
}

export function StepGuidance({ mode, isDismissed, onDismiss, show }: StepGuidanceProps) {
    if (mode !== 'easy' || !show || isDismissed) {return null;}

    return (
        <div className="absolute top-full left-0 mt-1 z-10 flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md shadow-sm animate-in slide-in-from-top-2">
            <span className="text-[10px] text-amber-700 font-medium">Example: &quot;What is your full name?&quot;</span>
            <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 text-amber-600 hover:text-amber-800 hover:bg-amber-100"
                onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            >
                <span className="sr-only">Dismiss</span>
                <X className="h-3 w-3" />
            </Button>
        </div>
    );
}
