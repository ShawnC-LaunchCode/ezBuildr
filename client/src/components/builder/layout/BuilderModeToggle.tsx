import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type React from "react";

export type BuilderMode = "easy" | "advanced";

const MODES: { value: BuilderMode; label: string; hint: string }[] = [
  { value: "easy", label: "Easy", hint: "Guided step types and a simplified builder" },
  { value: "advanced", label: "Advanced", hint: "Code blocks, dev panel, and advanced step variants" },
];

interface BuilderModeToggleProps {
  mode: BuilderMode;
  onChange: (mode: BuilderMode) => void;
  disabled?: boolean;
}

/**
 * Builder mode is a two-value choice, so it reads as one — not as a dropdown
 * whose menu offered "Switch to Easy Mode" while you were already in Easy Mode.
 * The current mode is now visible without opening anything, and switching is
 * one click instead of two.
 */
export function BuilderModeToggle({ mode, onChange, disabled = false }: BuilderModeToggleProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    const next: BuilderMode = mode === "easy" ? "advanced" : "easy";
    onChange(next);
    document.getElementById(`builder-mode-${next}`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Builder mode"
      className="flex h-8 shrink-0 items-center rounded-md border border-input p-0.5"
    >
      {MODES.map((option) => {
        const isSelected = option.value === mode;
        return (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                id={`builder-mode-${option.value}`}
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                disabled={disabled}
                onClick={() => { if (!isSelected) { onChange(option.value); } }}
                onKeyDown={handleKeyDown}
                className={cn(
                  "h-7 rounded-sm px-2 text-xs transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  isSelected
                    ? option.value === "advanced"
                      ? "bg-indigo-50 font-medium text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-100"
                      : "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{option.hint}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
