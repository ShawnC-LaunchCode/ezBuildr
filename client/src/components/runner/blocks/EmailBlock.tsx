/**
 * EmailBlockRenderer - Email Input
 *
 * Features:
 * - Email validation
 * - Multiple emails support (comma-separated)
 * - Basic format checking
 *
 * Storage: String (email address)
 */

import React from "react";

import { Input } from "@/components/ui/input";
import type { Step } from "@/types";

import type { EmailConfig } from "@shared/types/stepConfigs";

export interface EmailBlockProps {
  step: Step;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  onChange: (value: string) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
}

export function EmailBlockRenderer({ step, value, onChange, readOnly , ariaDescribedBy, required, hasError }: EmailBlockProps) {
  const config = step.config as EmailConfig;
  const placeholder = config?.placeholder ?? "email@example.com";

  return (
    <Input
      id={step.id}
      type="email"
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="email"
      disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
      />
  );
}
