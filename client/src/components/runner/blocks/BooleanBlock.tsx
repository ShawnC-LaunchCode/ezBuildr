/**
 * BooleanBlockRenderer - Boolean/Toggle Blocks
 *
 * Handles:
 * - yes_no (Yes/No toggle)
 * - true_false (True/False toggle)
 * - boolean (customizable labels)
 *
 * Features:
 * - Two-button boolean selector (recommended)
 * - Custom labels
 * - Store as boolean or string aliases
 *
 * Storage: boolean OR string (based on config)
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { Step } from "@/types";
import type { BooleanAdvancedConfig, TrueFalseConfig } from "@/../../shared/types/stepConfigs";

export interface BooleanBlockProps {
  step: Step;
  value: any;
  onChange: (value: boolean | string) => void;
  readOnly?: boolean;
}

export function BooleanBlockRenderer({ step, value, onChange, readOnly }: BooleanBlockProps) {
  // Parse config
  let trueLabel = "Yes";
  let falseLabel = "No";
  let storeAsBoolean = true;
  let displayStyle: "toggle" | "radio" | "checkbox" | "buttons" = "buttons";

  if (step.type === "yes_no") {
    trueLabel = (step.config as any)?.yesLabel || "Yes";
    falseLabel = (step.config as any)?.noLabel || "No";
  } else if (step.type === "true_false") {
    const config = step.config as TrueFalseConfig;
    trueLabel = config?.trueLabel || "True";
    falseLabel = config?.falseLabel || "False";
  } else if (step.type === "boolean") {
    const config = step.config as BooleanAdvancedConfig;
    trueLabel = config?.trueLabel || "Yes";
    falseLabel = config?.falseLabel || "No";
    storeAsBoolean = config?.storeAsBoolean ?? true;
    displayStyle = config?.displayStyle || "buttons";
  }

  // Determine current value
  const isTrue = storeAsBoolean ? value === true : value === trueLabel;

  // Handle change
  const handleChange = (newValue: boolean) => {
    if (storeAsBoolean) {
      onChange(newValue);
    } else {
      onChange(newValue ? trueLabel : falseLabel);
    }
  };

  // Render as two-button selector (recommended)
  if (displayStyle === "buttons") {
    return (
      <div className="flex gap-2">
        <Button
          type="button"
          variant={isTrue ? "default" : "outline"}
          onClick={() => !readOnly && handleChange(true)}
          disabled={readOnly}
          className="flex-1"
        >
          {trueLabel}
        </Button>
        <Button
          type="button"
          variant={!isTrue && value !== undefined && value !== null ? "default" : "outline"}
          onClick={() => !readOnly && handleChange(false)}
          disabled={readOnly}
          className="flex-1"
        >
          {falseLabel}
        </Button>
      </div>
    );
  }

  // Render as radio group (alternative)
  return (
    <RadioGroup
      value={isTrue ? "true" : "false"}
      onValueChange={(v) => !readOnly && handleChange(v === "true")}
      disabled={readOnly}
    >
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="true" id={`${step.id}-true`} />
        <Label htmlFor={`${step.id}-true`}>{trueLabel}</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="false" id={`${step.id}-false`} />
        <Label htmlFor={`${step.id}-false`}>{falseLabel}</Label>
      </div>
    </RadioGroup>
  );
}
