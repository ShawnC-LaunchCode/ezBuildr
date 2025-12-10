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

import React from "react";
import { Slider } from "@/components/ui/slider";
import { Star } from "lucide-react";
import type { Step } from "@/types";
import type { ScaleConfig } from "@/../../shared/types/stepConfigs";

export interface ScaleBlockProps {
  step: Step;
  value: any;
  onChange: (value: number) => void;
  readOnly?: boolean;
}

export function ScaleBlockRenderer({ step, value, onChange, readOnly }: ScaleBlockProps) {
  const config = step.config as ScaleConfig;
  const min = config?.min ?? 1;
  const max = config?.max ?? 10;
  const step_value = config?.step ?? 1;
  const display = config?.display || "slider";
  const showValue = config?.showValue ?? true;
  const minLabel = config?.minLabel;
  const maxLabel = config?.maxLabel;

  const currentValue = value !== null && value !== undefined ? value : min;

  // Slider mode
  if (display === "slider") {
    return (
      <div className="space-y-4">
        <Slider
          id={step.id}
          value={[currentValue]}
          onValueChange={(vals) => !readOnly && onChange(vals[0])}
          min={min}
          max={max}
          step={step_value}
          disabled={readOnly}
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

    return (
      <div className="flex items-center gap-1">
        {Array.from({ length: numStars }, (_, i) => i + 1).map((starValue) => (
          <button
            key={starValue}
            type="button"
            onClick={() => !readOnly && onChange(starValue)}
            disabled={readOnly}
            className="transition-colors hover:scale-110 disabled:cursor-not-allowed"
          >
            <Star
              className={`w-8 h-8 ${
                starValue <= currentValue
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-gray-300"
              }`}
            />
          </button>
        ))}
        {showValue && (
          <span className="ml-2 text-sm font-semibold">
            {currentValue} / {numStars}
          </span>
        )}
      </div>
    );
  }

  return null;
}
