/**
 * WebsiteBlockRenderer - Website/URL Input
 *
 * Features:
 * - URL validation
 * - Protocol enforcement (http/https)
 * - Auto-prepend https:// if missing
 *
 * Storage: String (URL)
 */

import React from "react";

import { Input } from "@/components/ui/input";
import type { Step } from "@/types";

import type { WebsiteConfig } from "@shared/types/stepConfigs";

export interface WebsiteBlockProps {
  step: Step;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  onChange: (value: string) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
}

export function WebsiteBlockRenderer({ step, value, onChange, readOnly , ariaDescribedBy, required, hasError }: WebsiteBlockProps) {
  const config = step.config as WebsiteConfig;
  const placeholder = config?.placeholder ?? "https://example.com";

  const handleBlur = () => {
    // Auto-prepend https:// if missing
    if (value && !String(value).match(/^https?:\/\//i)) {
      onChange(`https://${value}`);
    }
  };

  return (
    <Input
      id={step.id}
      type="url"
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder}
      autoComplete="url"
      disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
      />
  );
}
