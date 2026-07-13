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

import { useState, useEffect } from "react";

import { Input } from "@/components/ui/input";
import type { Step } from "@/types";

import type { NumberConfig, NumberAdvancedConfig } from "@shared/types/stepConfigs";

export interface NumberBlockProps {
  step: Step;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  onChange: (value: number | null) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
}

export function NumberBlockRenderer({ step, value, onChange, readOnly , ariaDescribedBy, required, hasError }: NumberBlockProps) {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  const config = (step.config as NumberConfig) || (step.config as NumberAdvancedConfig);

  const min = config?.min;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const max = config?.max;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const step_value = config?.step ?? 1;
  const allowDecimal = config?.allowDecimal ?? true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const placeholder = (config as any)?.placeholder || "0";

  const [displayValue, setDisplayValue] = useState("");
  const [_isFocused, _setIsFocused] = useState(false);

  // Sync display value with prop value
  useEffect(() => {
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
    if (min !== undefined && parsed < min) {
      return;
    }
    if (max !== undefined && parsed > max) {
      return;
    }

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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      placeholder={placeholder}
      disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
      />
  );
}
