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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Step } from "@/types";

import type { BooleanAdvancedConfig, TrueFalseConfig } from "@shared/types/stepConfigs";

export interface BooleanBlockProps {
  step: Step;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  onChange: (value: boolean | string) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
}

interface NormalizedBooleanConfig {
  trueLabel: string;
  falseLabel: string;
  storeAsBoolean: boolean;
  displayStyle: "toggle" | "radio" | "checkbox" | "buttons";
}

function getConfigString(config: unknown, key: string): string | undefined {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return undefined;
  }
  const value = (config as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function getBooleanConfig(step: Step): NormalizedBooleanConfig {
  if (step.type === "yes_no") {
    return {
      trueLabel: getConfigString(step.config, "yesLabel") ?? "Yes",
      falseLabel: getConfigString(step.config, "noLabel") ?? "No",
      storeAsBoolean: true,
      displayStyle: "buttons",
    };
  }

  if (step.type === "true_false") {
    const config = step.config as TrueFalseConfig;
    return {
      trueLabel: config?.trueLabel ?? "True",
      falseLabel: config?.falseLabel ?? "False",
      storeAsBoolean: true,
      displayStyle: "buttons",
    };
  }

  if (step.type === "boolean") {
    const config = step.config as BooleanAdvancedConfig;
    return {
      trueLabel: config?.trueLabel ?? "Yes",
      falseLabel: config?.falseLabel ?? "No",
      storeAsBoolean: config?.storeAsBoolean ?? true,
      displayStyle: config?.displayStyle ?? "buttons",
    };
  }

  return {
    trueLabel: "Yes",
    falseLabel: "No",
    storeAsBoolean: true,
    displayStyle: "buttons",
  };
}

export function BooleanBlockRenderer({
  step,
  value,
  onChange,
  readOnly,
  ariaDescribedBy,
  required,
  hasError,
}: BooleanBlockProps) {
  const { trueLabel, falseLabel, storeAsBoolean, displayStyle } = getBooleanConfig(step);

  // Determine current value
  const isTrue = storeAsBoolean ? value === true : value === trueLabel;
  const isDefined = value !== undefined && value !== null;
  const fieldA11y = {
    "aria-describedby": ariaDescribedBy,
    "aria-required": required === true ? true : undefined,
    "aria-invalid": hasError === true ? true : undefined,
  };

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
      <div className="flex gap-2" role="group" aria-label={step.title}>
        <Button
          type="button"
          variant={isTrue && isDefined ? "default" : "outline"}
          onClick={() => !readOnly && handleChange(true)}
          disabled={readOnly}
          className="flex-1"
          aria-pressed={isTrue && isDefined}
          {...fieldA11y}
        >
          {trueLabel}
        </Button>
        <Button
          type="button"
          variant={!isTrue && isDefined ? "default" : "outline"}
          onClick={() => !readOnly && handleChange(false)}
          disabled={readOnly}
          className="flex-1"
          aria-pressed={!isTrue && isDefined}
          {...fieldA11y}
        >
          {falseLabel}
        </Button>
      </div>
    );
  }

  // Render as radio group (alternative)
  return (
    <RadioGroup
      value={isDefined ? (isTrue ? "true" : "false") : undefined}
      onValueChange={(v) => !readOnly && handleChange(v === "true")}
      disabled={readOnly}
      {...fieldA11y}
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
