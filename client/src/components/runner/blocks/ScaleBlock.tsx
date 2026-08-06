/**
 * ScaleBlockRenderer - Rating Scale Input
 *
 * Features:
 * - Slider mode (range input)
 * - Stars mode (clickable stars)
 * - Min/max labels
 * - Current value display
 *
 * Storage: number (whole number)
 */

import { Star } from "lucide-react";
import React from "react";

import { Slider } from "@/components/ui/slider";
import type { Step } from "@/types";

import type { ScaleConfig } from "@shared/types/stepConfigs";

export interface ScaleBlockProps {
  step: Step;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  onChange: (value: number) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
}

export function ScaleBlockRenderer({ step, value, onChange, readOnly, ariaDescribedBy, required, hasError }: ScaleBlockProps) {
  const config = step.config as ScaleConfig;
  const min = config?.min ?? 1;
  const max = config?.max ?? 10;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const step_value = config?.step ?? 1;
  const display = config?.display ?? "slider";
  const showValue = config?.showValue ?? true;
  const minLabel = config?.minLabel;
  const maxLabel = config?.maxLabel;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/prefer-nullish-coalescing
  const currentValue = value !== null && value !== undefined ? value : min;

  // Slider mode
  if (display === "slider") {
    return (
      <div className="space-y-4">
        <Slider
          id={step.id}
          aria-label={step.title}
          thumbAriaLabel={step.title}
          value={[currentValue]}
          onValueChange={(vals) => {
            if (!readOnly) {
              onChange(vals[0]);
            }
          }}
          min={min}
          max={max}
          step={step_value}
          disabled={readOnly}
          aria-describedby={ariaDescribedBy}
          aria-invalid={hasError ? "true" : undefined}
          className="w-full"
        />

        <div className="flex justify-between items-center text-sm">
          {minLabel && <span className="text-muted-foreground">{minLabel}</span>}
          {showValue && (
            <span className="font-semibold">
              {currentValue} / {max}
            </span>
          )}
          {maxLabel && <span className="text-muted-foreground">{maxLabel}</span>}
        </div>
      </div>
    );
  }

  // Stars mode
  if (display === "stars") {
    const numStars = max;
    const selectedStar = typeof currentValue === "number" && currentValue >= 1 ? currentValue : 1;

    const handleStarKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, starValue: number) => {
      if (readOnly) {
        return;
      }

      let targetStar = starValue;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        targetStar = Math.min(numStars, starValue + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        targetStar = Math.max(1, starValue - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        targetStar = 1;
      } else if (e.key === "End") {
        e.preventDefault();
        targetStar = numStars;
      } else {
        return;
      }

      onChange(targetStar);
      const targetElement = document.getElementById(`scale-star-${step.id}-${targetStar}`);
      targetElement?.focus();
    };

    return (
      <div
        role="radiogroup"
        aria-label={step.title}
        aria-describedby={ariaDescribedBy}
        aria-required={required === true ? true : undefined}
        aria-invalid={hasError ? "true" : undefined}
        className="flex items-center gap-1"
      >
        {Array.from({ length: numStars }, (_, i) => i + 1).map((starValue) => {
          const isChecked = starValue === currentValue;
          const isTabbable = starValue === selectedStar;

          return (
            <button
              key={starValue}
              id={`scale-star-${step.id}-${starValue}`}
              type="button"
              role="radio"
              aria-checked={isChecked}
              tabIndex={isTabbable ? 0 : -1}
              onClick={() => {
                if (!readOnly) {
                  onChange(starValue);
                }
              }}
              onKeyDown={(e) => handleStarKeyDown(e, starValue)}
              disabled={readOnly}
              className="transition-colors hover:scale-110 disabled:cursor-not-allowed p-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={`${starValue} of ${numStars} stars`}
            >
              <Star
                className={`w-8 h-8 ${starValue <= currentValue
                    ? "fill-warning text-warning"
                    : "text-muted-foreground"
                  }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
        {showValue && (
          <span className="ml-2 text-sm font-semibold" aria-hidden="true">
            {currentValue} / {numStars}
          </span>
        )}
      </div>
    );
  }

  return null;
}
