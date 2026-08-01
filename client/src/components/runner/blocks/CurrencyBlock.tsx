/**
 * CurrencyBlockRenderer - Currency Input
 *
 * Features:
 * - $ prefix display
 * - Thousand separators (commas)
 * - Decimal support (whole or decimal)
 * - Min/max validation
 * - Max decimal places validation (2 places)
 *
 * Storage: number (pure numeric value without formatting)
 */

import { useState, useEffect } from "react";

import { Input } from "@/components/ui/input";
import type { Step } from "@/types";

import type { CurrencyConfig } from "@shared/types/stepConfigs";

export interface CurrencyBlockProps {
  step: Step;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  onChange: (value: number | null) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
}

export function CurrencyBlockRenderer({ step, value, onChange, readOnly , ariaDescribedBy, required, hasError }: CurrencyBlockProps) {
  const config = step.config as CurrencyConfig;
  const _currency = config?.currency ?? "USD";
  const allowDecimal = config?.allowDecimal ?? true;
  const min = config?.min;
  const max = config?.max;

  const [displayValue, setDisplayValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  // Format number with commas and decimals
  const formatCurrency = (num: number | null): string => {
    if (num === null || num === undefined) {
      return "";
    }

    if (allowDecimal) {
      return num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } else {
      return Math.floor(num).toLocaleString("en-US");
    }
  };

  // Sync display value with prop value
  useEffect(() => {
    if (!isFocused) {
      if (value !== null && value !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        setDisplayValue(formatCurrency(value));
      } else {
        setDisplayValue("");
      }
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    // Show raw value when focused (easier to edit)
    if (value !== null && value !== undefined) {
      setDisplayValue(String(value));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Re-format on blur
  };

  const handleChange = (newValue: string) => {
    // Remove formatting characters ($, commas)
    const cleanValue = newValue.replace(/[$,]/g, "");
    setDisplayValue(cleanValue);

    if (cleanValue === "") {
      onChange(null);
      return;
    }

    const parsed = allowDecimal ? parseFloat(cleanValue) : parseInt(cleanValue, 10);

    if (isNaN(parsed)) {
      return;
    }

    // Check decimal places
    if (allowDecimal && cleanValue.includes(".")) {
      const decimals = cleanValue.split(".")[1];
      // Hardcoded to 2 for currency, could be configurable in future
      if (decimals && decimals.length > 2) {
        return; // Ignore input if more than 2 decimal places
      }
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
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
        $
      </span>
      <Input
        id={step.id}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="0.00"
        disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
      className="pl-7"
      />
    </div>
  );
}
