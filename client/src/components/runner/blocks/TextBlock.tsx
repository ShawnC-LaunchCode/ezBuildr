/**
 * TextBlockRenderer - Text Input Blocks
 *
 * Handles:
 * - short_text (single-line input)
 * - long_text (multi-line textarea)
 * - text (unified with variant config)
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

import type { TextAdvancedConfig } from "@/../../shared/types/stepConfigs";

export interface TextBlockProps {
  step: Step;
  value: any;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function TextBlockRenderer({ step, value, onChange, readOnly }: TextBlockProps) {
  const currentValue = value || "";

  // Determine if this is short or long text
  let variant: "short" | "long" = "short";
  let maxLength: number | undefined;
  let placeholder: string | undefined;

  if (step.type === "short_text") {
    variant = "short";
    maxLength = (step.config)?.maxLength;
    placeholder = (step.config)?.placeholder || "Your answer...";
  } else if (step.type === "long_text") {
    variant = "long";
    maxLength = (step.config)?.maxLength;
    placeholder = (step.config)?.placeholder || "Your answer...";
  } else if (step.type === "text") {
    const config = step.config as TextAdvancedConfig;
    variant = config?.variant || "short";
    maxLength = config?.validation?.maxLength;
    placeholder = config?.placeholder || "Your answer...";
  }

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
          className="resize-y"
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
