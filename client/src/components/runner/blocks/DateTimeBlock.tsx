/**
 * DateTimeBlockRenderer - Canonical Date / Time / Date-Time Picker
 *
 * Features:
 * - Combined date and time selection
 * - Min/max date enforcement
 * - Time format (12h/24h)
 * - Time step increment
 *
 * Storage: ISO 8601 full timestamp (YYYY-MM-DDTHH:mm:ss)
 */

import { useEffect } from "react";

import { Input } from "@/components/ui/input";
import type { Step } from "@/types";

import { resolveDateTimeConfig } from "@shared/types/stepConfigs";

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
  const config = resolveDateTimeConfig(step.type, step.config);
  const includesTime = config.kind !== "date";
  const includesDate = config.kind !== "time";
  const inputType = config.kind === "date"
    ? "date"
    : config.kind === "time"
      ? "time"
      : "datetime-local";
  const timeStep = config.timeStep ?? 15;

  // Convert step to seconds for HTML input
  const stepSeconds = timeStep * 60;

  useEffect(() => {
    if (config.kind === "date" && !value && config.defaultToToday) {
      onChange(new Date().toISOString().split("T")[0]);
    }
  }, [config.defaultToToday, config.kind, onChange, value]);

  return (
    <Input
      id={step.id}
      type={inputType}
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      min={includesDate ? config.minDate : undefined}
      max={includesDate ? config.maxDate : undefined}
      step={includesTime ? stepSeconds : undefined}
      lang={includesTime ? (config.timeFormat === "24h" ? "en-GB" : "en-US") : undefined}
      disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
      />
  );
}
