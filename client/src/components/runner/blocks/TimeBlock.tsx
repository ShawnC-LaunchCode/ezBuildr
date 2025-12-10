/**
 * TimeBlockRenderer - Time Picker
 *
 * Features:
 * - Time selection
 * - 12h/24h format support
 * - Step increment (e.g., 15 minutes)
 *
 * Storage: HH:mm:ss (24-hour format ISO time string)
 */

import React from "react";
import { Input } from "@/components/ui/input";
import type { Step } from "@/types";
import type { TimeConfig } from "@/../../shared/types/stepConfigs";

export interface TimeBlockProps {
  step: Step;
  value: any;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function TimeBlockRenderer({ step, value, onChange, readOnly }: TimeBlockProps) {
  const config = step.config as TimeConfig;
  const step_minutes = config?.step || 15;

  // Convert step to seconds for HTML input
  const stepSeconds = step_minutes * 60;

  return (
    <Input
      id={step.id}
      type="time"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      step={stepSeconds}
      disabled={readOnly}
    />
  );
}
