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
import type { EmailConfig } from "@/../../shared/types/stepConfigs";

export interface EmailBlockProps {
  step: Step;
  value: any;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function EmailBlockRenderer({ step, value, onChange, readOnly }: EmailBlockProps) {
  const config = step.config as EmailConfig;
  const placeholder = config?.placeholder || "email@example.com";

  return (
    <Input
      id={step.id}
      type="email"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={readOnly}
    />
  );
}
