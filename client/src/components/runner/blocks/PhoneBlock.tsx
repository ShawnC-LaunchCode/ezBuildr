/**
 * PhoneBlockRenderer - Phone Number Input
 *
 * Features:
 * - US phone formatting (XXX) XXX-XXXX
 * - International support (future)
 * - Input masking
 * - Validation
 *
 * Storage: Normalized string (digits only or E.164 format)
 */

import React from "react";
import { Input } from "@/components/ui/input";
import type { Step } from "@/types";
import type { PhoneConfig } from "@/../../shared/types/stepConfigs";

export interface PhoneBlockProps {
  step: Step;
  value: any;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function PhoneBlockRenderer({ step, value, onChange, readOnly }: PhoneBlockProps) {
  const config = step.config as PhoneConfig;
  const format = config?.format || "US";

  // Format phone number for display
  const formatPhoneDisplay = (phone: string): string => {
    if (!phone) return "";

    // Remove all non-digits
    const digits = phone.replace(/\D/g, "");

    if (format === "US") {
      // US format: (XXX) XXX-XXXX
      if (digits.length <= 3) return digits;
      if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }

    // International: just return digits
    return digits;
  };

  // Handle change with formatting
  const handleChange = (newValue: string) => {
    // Extract digits only
    const digits = newValue.replace(/\D/g, "");

    // Limit to 10 digits for US
    if (format === "US" && digits.length > 10) return;

    // Store normalized value (digits only)
    onChange(digits);
  };

  const displayValue = formatPhoneDisplay(value || "");

  return (
    <Input
      id={step.id}
      type="tel"
      value={displayValue}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={format === "US" ? "(555) 123-4567" : "Phone number"}
      disabled={readOnly}
    />
  );
}
