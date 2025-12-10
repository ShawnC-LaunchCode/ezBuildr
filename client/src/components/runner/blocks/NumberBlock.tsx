/**
 * NumberBlockRenderer - Numeric Input
 *
 * Features:
 * - Integer and decimal support
 * - Min/max validation
 * - Step increment
 * - Precision control
 *
 * Storage: number (pure numeric value)
 */

import React from "react";
import { Input } from "@/components/ui/input";
import type { Step } from "@/types";
import type { NumberConfig, NumberAdvancedConfig } from "@/../../shared/types/stepConfigs";

export interface NumberBlockProps {
  step: Step;
  value: any;
  onChange: (value: number | null) => void;
  readOnly?: boolean;
}

export function NumberBlockRenderer({ step, value, onChange, readOnly }: NumberBlockProps) {
  const config = (step.config as NumberConfig) || (step.config as NumberAdvancedConfig);

  const min = config?.min;
  const max = config?.max;
  const step_value = config?.step || 1;
  const allowDecimal = config?.allowDecimal ?? true;
  const placeholder = (config as any)?.placeholder || "0";

  const [displayValue, setDisplayValue] = React.useState("");

  // Sync display value with prop value
  React.useEffect(() => {
    if (value !== null && value !== undefined) {
      setDisplayValue(String(value));
    } else {
      setDisplayValue("");
    }
  }, [value]);

  const handleChange = (newValue: string) => {
    setDisplayValue(newValue);

    // Empty string = null
    if (newValue === "") {
      onChange(null);
      return;
    }

    // Parse number
    const parsed = allowDecimal ? parseFloat(newValue) : parseInt(newValue, 10);

    if (isNaN(parsed)) {
      return;
    }

    // Enforce min/max
    if (min !== undefined && parsed < min) return;
    if (max !== undefined && parsed > max) return;

    onChange(parsed);
  };

  return (
    <Input
      id={step.id}
      type="number"
      value={displayValue}
      onChange={(e) => handleChange(e.target.value)}
      min={min}
      max={max}
      step={step_value}
      placeholder={placeholder}
      disabled={readOnly}
    />
  );
}
