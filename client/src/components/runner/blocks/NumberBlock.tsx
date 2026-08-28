/**
 * NumberBlockRenderer - Canonical numeric input (STB-9)
 *
 * Renders the canonical `number` type. Retired dialects are adapted to this
 * shape before the renderer sees them (BlockRenderer's LEGACY_STEP_ADAPTERS).
 *
 * Two rules shape this control:
 *
 * - **Display and storage are separate** (Decision 8). Grouping, prefix and
 *   suffix change only what is on screen; `onChange` emits `number | null` and
 *   nothing else.
 * - **Never discard a keystroke.** Intermediate text on the way to a number —
 *   "-", "1.", "-0." — stays on screen and simply emits no value yet. The
 *   previous implementation returned early on out-of-range input, so typing
 *   "5" into a field with min 10 silently ate the character. Range problems
 *   are reported by validation, not by refusing input.
 */

import { useState, useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Step } from "@/types";

import { resolveNumberConfig, type NumberValue } from "@shared/types/stepConfigs";

import {
  adornmentPadding,
  applyLiveGrouping,
  formatNumberForDisplay,
  parseNumericInput,
} from "./numberFormat";

export interface NumberBlockProps {
  step: Step;
  value: unknown;
  onChange: (value: NumberValue) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
}

export function NumberBlockRenderer({
  step, value, onChange, readOnly, ariaDescribedBy, required, hasError,
}: NumberBlockProps) {
  const config = resolveNumberConfig(step.type, step.config);
  const { thousandsSeparator, formatOnInput, prefix, suffix } = config;
  const precision = config.validation?.precision;
  const numericValue = typeof value === "number" ? value : null;

  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState(() =>
    formatNumberForDisplay(numericValue, { thousandsSeparator, precision })
  );

  // Re-sync from the outside only while unfocused, so a value arriving mid-edit
  // cannot yank the caret or rewrite what is being typed.
  useEffect(() => {
    if (isFocused) { return; }
    setDisplayValue(formatNumberForDisplay(numericValue, { thousandsSeparator, precision }));
  }, [numericValue, isFocused, thousandsSeparator, precision]);

  const handleFocus = () => {
    setIsFocused(true);
    if (formatOnInput === true) { return; }
    // Ungroup for editing unless grouping is meant to stay live.
    setDisplayValue(numericValue === null ? "" : String(numericValue));
  };

  const handleBlur = () => {
    setIsFocused(false);
    setDisplayValue(formatNumberForDisplay(numericValue, { thousandsSeparator, precision }));
  };

  const handleChange = (raw: string, caret: number | null) => {
    const live = formatOnInput === true && thousandsSeparator === true;
    const next = live && caret !== null ? applyLiveGrouping(raw, caret) : { text: raw, caret: null };

    setDisplayValue(next.text);
    if (live && next.caret !== null) {
      const position = next.caret;
      requestAnimationFrame(() => inputRef.current?.setSelectionRange(position, position));
    }

    const { value: parsed, intermediate } = parseNumericInput(next.text);
    // Intermediate text keeps its characters but emits nothing; anything else
    // (including out-of-range) is emitted and left to validation.
    if (intermediate) { return; }
    onChange(parsed);
  };

  const describedBy = [ariaDescribedBy, prefix !== undefined || suffix !== undefined ? `${step.id}-unit` : undefined]
    .filter(Boolean).join(" ") || undefined;

  return (
    <div className="relative">
      {prefix !== undefined && (
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-sm text-muted-foreground"
          aria-hidden="true"
        >
          {prefix}
        </span>
      )}
      <Input
        id={step.id}
        ref={inputRef}
        type="text"
        // Always "decimal": precision formats the display, it does not
        // limit what may be entered, so the keypad must always offer a point.
        inputMode="decimal"
        value={displayValue}
        onChange={(e) => handleChange(e.target.value, e.target.selectionStart)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={config.placeholder ?? "0"}
        disabled={readOnly}
        aria-describedby={describedBy}
        aria-required={required ? "true" : undefined}
        aria-invalid={hasError ? "true" : undefined}
        className={cn(adornmentPadding(prefix, "left"), adornmentPadding(suffix, "right"))}
      />
      {suffix !== undefined && (
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none text-sm text-muted-foreground"
          aria-hidden="true"
        >
          {suffix}
        </span>
      )}
      {(prefix !== undefined || suffix !== undefined) && (
        // The adornments are decorative duplicates for sighted users; the unit
        // still has to reach assistive tech, which absolutely-positioned spans
        // do not do on their own.
        <span id={`${step.id}-unit`} className="sr-only">
          {[prefix, suffix].filter(Boolean).join(" ")}
        </span>
      )}
    </div>
  );
}
