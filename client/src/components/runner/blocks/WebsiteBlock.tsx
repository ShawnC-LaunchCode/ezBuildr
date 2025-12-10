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
import type { WebsiteConfig } from "@/../../shared/types/stepConfigs";

export interface WebsiteBlockProps {
  step: Step;
  value: any;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function WebsiteBlockRenderer({ step, value, onChange, readOnly }: WebsiteBlockProps) {
  const config = step.config as WebsiteConfig;
  const placeholder = config?.placeholder || "https://example.com";

  const handleBlur = () => {
    // Auto-prepend https:// if missing
    if (value && !value.match(/^https?:\/\//i)) {
      onChange(`https://${value}`);
    }
  };

  return (
    <Input
      id={step.id}
      type="url"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={readOnly}
    />
  );
}
