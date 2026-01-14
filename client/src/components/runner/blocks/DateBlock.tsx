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

import React from "react";

import { Input } from "@/components/ui/input";
import type { Step } from "@/types";

import type { DateConfig } from "@/../../shared/types/stepConfigs";

export interface DateBlockProps {
  step: Step;
  value: any;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function DateBlockRenderer({ step, value, onChange, readOnly }: DateBlockProps) {
  const config = step.config as DateConfig;

  // Initialize with today's date if configured
  React.useEffect(() => {
    if (!value && config?.defaultToToday) {
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      onChange(today);
    }
  }, [value, config?.defaultToToday, onChange]);

  return (
    <Input
      id={step.id}
      type="date"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      min={config?.minDate}
      max={config?.maxDate}
      disabled={readOnly}
    />
  );
}
