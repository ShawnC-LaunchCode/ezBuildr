/**
 * DateBlockRenderer - Date Picker
 *
 * Features:
 * - Date selection
 * - Min/max date enforcement
 * - Default to today option
 *
 * Storage: YYYY-MM-DD (ISO 8601 date string)
 */

import { useEffect } from "react";

import { Input } from "@/components/ui/input";
import type { Step } from "@/types";

import type { DateConfig } from "@shared/types/stepConfigs";

export interface DateBlockProps {
  step: Step;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  onChange: (value: string) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
}

export function DateBlockRenderer({ step, value, onChange, readOnly , ariaDescribedBy, required, hasError }: DateBlockProps) {
  const config = step.config as DateConfig;

  // Initialize with today's date if configured
  useEffect(() => {
    if (!value && config?.defaultToToday) {
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      onChange(today);
    }
  }, [value, config?.defaultToToday, onChange]);

  return (
    <Input
      id={step.id}
      type="date"
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      min={config?.minDate}
      max={config?.maxDate}
      disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
      />
  );
}
