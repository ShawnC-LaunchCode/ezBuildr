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

import type { DateTimeConfig } from "@/../../shared/types/stepConfigs";

export interface DateTimeBlockProps {
  step: Step;
  value: any;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function DateTimeBlockRenderer({ step, value, onChange, readOnly }: DateTimeBlockProps) {
  const config = step.config as DateTimeConfig;
  const timeStep = config?.timeStep || 15;

  // Convert step to seconds for HTML input
  const stepSeconds = timeStep * 60;

  return (
    <Input
      id={step.id}
      type="datetime-local"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      min={config?.minDate}
      max={config?.maxDate}
      step={stepSeconds}
      disabled={readOnly}
    />
  );
}
