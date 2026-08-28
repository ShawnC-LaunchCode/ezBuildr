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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
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

type BooleanFieldA11y = Pick<
  React.AriaAttributes,
  "aria-describedby" | "aria-required" | "aria-invalid"
>;

interface BooleanControlProps {
  step: Step;
  trueLabel: string;
  falseLabel: string;
  isTrue: boolean;
  isDefined: boolean;
  onSelect: (value: boolean) => void;
  readOnly?: boolean;
  fieldA11y: BooleanFieldA11y;
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
      trueLabel: getConfigString(step.config, "yesLabel")
        ?? getConfigString(step.config, "trueLabel")
        ?? "Yes",
      falseLabel: getConfigString(step.config, "noLabel")
        ?? getConfigString(step.config, "falseLabel")
        ?? "No",
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

function BooleanButtons({
  step,
  trueLabel,
  falseLabel,
  isTrue,
  isDefined,
  onSelect,
  readOnly,
  fieldA11y,
}: BooleanControlProps): JSX.Element {
  return (
    <div className="flex gap-2" role="group" aria-label={step.title}>
      <Button
        type="button"
        variant={isTrue && isDefined ? "default" : "outline"}
        onClick={() => { onSelect(true); }}
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
        onClick={() => { onSelect(false); }}
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

function getValueState(isDefined: boolean, isTrue: boolean): "unset" | "true" | "false" {
  if (!isDefined) { return "unset"; }
  return isTrue ? "true" : "false";
}

function BooleanToggle({
  step,
  trueLabel,
  falseLabel,
  isTrue,
  isDefined,
  onSelect,
  readOnly,
  fieldA11y,
}: BooleanControlProps): JSX.Element {
  return (
    <div
      className="flex items-center gap-3"
      role="group"
      aria-label={step.title}
      data-value-state={getValueState(isDefined, isTrue)}
    >
      <span className={cn(
        "text-sm transition-colors",
        isDefined && !isTrue ? "font-medium text-foreground" : "text-muted-foreground",
      )}>
        {falseLabel}
      </span>
      <Switch
        checked={isDefined && isTrue}
        onCheckedChange={onSelect}
        disabled={readOnly}
        aria-label={`${step.title}: ${trueLabel}`}
        {...fieldA11y}
      />
      <span className={cn(
        "text-sm transition-colors",
        isDefined && isTrue ? "font-medium text-foreground" : "text-muted-foreground",
      )}>
        {trueLabel}
      </span>
      <span className="sr-only" aria-live="polite">
        {getValueState(isDefined, isTrue) === "unset"
          ? "Not answered"
          : isTrue ? trueLabel : falseLabel}
      </span>
    </div>
  );
}

function BooleanRadios({
  step,
  trueLabel,
  falseLabel,
  isTrue,
  isDefined,
  onSelect,
  readOnly,
  fieldA11y,
}: BooleanControlProps): JSX.Element {
  return (
    <RadioGroup
      aria-label={step.title}
      value={isDefined ? (isTrue ? "true" : "false") : ""}
      onValueChange={(value) => { onSelect(value === "true"); }}
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
  const fieldA11y: BooleanFieldA11y = {
    "aria-describedby": ariaDescribedBy,
    "aria-required": required === true ? true : undefined,
    "aria-invalid": hasError === true ? true : undefined,
  };

  // Handle change
  const handleChange = (newValue: boolean): void => {
    onChange(storeAsBoolean ? newValue : newValue ? trueLabel : falseLabel);
  };

  const controlProps: BooleanControlProps = {
    step,
    trueLabel,
    falseLabel,
    isTrue,
    isDefined,
    onSelect: handleChange,
    readOnly,
    fieldA11y,
  };

  if (displayStyle === "buttons") { return <BooleanButtons {...controlProps} />; }
  if (displayStyle === "toggle") { return <BooleanToggle {...controlProps} />; }

  // Radio is also the temporary read-compatible fallback for checkbox configs;
  // STB-6 adds the consent-specific checkbox semantics.
  return <BooleanRadios {...controlProps} />;
}
