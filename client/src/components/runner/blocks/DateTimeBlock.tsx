/**
 * DateTimeBlockRenderer - Combined Date and Time Picker
 *
 * Features:
 * - Combined date and time selection
 * - Min/max date enforcement
 * - Time format (12h/24h)
 * - Time step increment
 *
 * Storage: ISO 8601 full timestamp (YYYY-MM-DDTHH:mm:ss)
 */

import React from "react";

import { Input } from "@/components/ui/input";
import type { Step } from "@/types";

import type { DateTimeConfig } from "@shared/types/stepConfigs";

export interface DateTimeBlockProps {
  step: Step;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  onChange: (value: string) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
}

export function DateTimeBlockRenderer({ step, value, onChange, readOnly , ariaDescribedBy, required, hasError }: DateTimeBlockProps) {
  const config = step.config as DateTimeConfig;
  const timeStep = config?.timeStep ?? 15;

  // Convert step to seconds for HTML input
  const stepSeconds = timeStep * 60;

  return (
    <Input
      id={step.id}
      type="datetime-local"
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      min={config?.minDate}
      max={config?.maxDate}
      step={stepSeconds}
      disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
      />
  );
}
