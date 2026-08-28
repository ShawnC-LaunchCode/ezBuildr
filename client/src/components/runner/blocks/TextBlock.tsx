/**
 * TextBlockRenderer - Text Input Blocks
 *
 * Renders the canonical `text` type. Legacy text-family rows are adapted to
 * this shape by BlockRenderer until STB-19 backfills them.
 *
 * Features:
 * - maxLength enforcement
 * - regex pattern validation
 * - placeholder support
 * - Auto-save on change
 *
 * Storage: String value
 */

import React from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Step } from "@/types";

import { resolveTextConfig, type TextValue } from "@shared/types/stepConfigs";

export interface TextBlockProps {
  step: Step;
  value: TextValue | undefined;
  onChange: (value: TextValue) => void;
  readOnly?: boolean;
  required?: boolean;
  hasError?: boolean;
  ariaDescribedBy?: string;
}

export function TextBlockRenderer({ step, value, onChange, readOnly , ariaDescribedBy, required, hasError }: TextBlockProps) {
  const currentValue = value ?? "";

  const config = resolveTextConfig(step.type, step.config);
  const { variant } = config;
  const maxLength = config.validation?.maxLength;
  const placeholder = config.placeholder ?? "Your answer...";

  // Handle change
  const handleChange = (newValue: string) => {
    // Enforce maxLength
    if (maxLength && newValue.length > maxLength) {
      return;
    }
    onChange(newValue);
  };

  if (variant === "long") {
    return (
      <div className="space-y-1">
        <Textarea
          id={step.id}
          value={currentValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
      className="resize-y"
      maxLength={maxLength}
        />
        {maxLength && (
          <p className="text-xs text-muted-foreground text-right">
            {currentValue.length} / {maxLength}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        id={step.id}
        type="text"
        value={currentValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={readOnly}
      aria-describedby={ariaDescribedBy}
      aria-required={required ? "true" : undefined}
      aria-invalid={hasError ? "true" : undefined}
      maxLength={maxLength}
      />
      {maxLength && (
        <p className="text-xs text-muted-foreground text-right">
          {currentValue.length} / {maxLength}
        </p>
      )}
    </div>
  );
}
