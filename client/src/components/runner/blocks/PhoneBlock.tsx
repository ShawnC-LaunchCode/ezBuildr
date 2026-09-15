/**
 * PhoneBlockRenderer - Phone Number Input
 *
 * Storage: digits only. Display: right-filled, like entering money from the
 * pennies -- "7654321" shows as "765-4321" and "120987654321" as
 * "+12 (098) 765-4321" (shared/phoneFormat.ts). Formatting is display only; the
 * stored value never carries it.
 *
 * A number shorter than seven digits is flagged once typing pauses for a
 * second, and page validation refuses it on Next.
 */

import React, { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import type { Step } from "@/types";

import {
  extractPhoneDigits,
  formatPhoneNumber,
  PHONE_MAX_DIGITS,
  phoneValidationError,
} from "@shared/phoneFormat";
import { resolvePhoneConfig } from "@shared/types/stepConfigs";

/** How long typing must pause before a too-short number is flagged. */
export const PHONE_IDLE_CHECK_MS = 1000;

export interface PhoneBlockProps {
  step: Step;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  onChange: (value: string) => void;
  readOnly?: boolean;
  ariaDescribedBy?: string;
  required?: boolean;
  hasError?: boolean;
}

export function PhoneBlockRenderer({ step, value, onChange, readOnly, ariaDescribedBy, required, hasError }: PhoneBlockProps) {
  const config = resolvePhoneConfig(step.config);
  const [idleError, setIdleError] = useState<string | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => { clearTimeout(idleTimerRef.current); }, []);

  const handleChange = (text: string) => {
    const digits = extractPhoneDigits(text).slice(0, PHONE_MAX_DIGITS);
    onChange(digits);

    setIdleError(null);
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => { setIdleError(phoneValidationError(digits)); }, PHONE_IDLE_CHECK_MS);
  };

  // Page validation already shows its own message below the field; never show both.
  const showIdleError = idleError !== null && hasError !== true;
  const idleErrorId = `${step.id}-phone-hint`;
  const describedBy = [ariaDescribedBy, showIdleError ? idleErrorId : undefined].filter(Boolean).join(" ");

  return (
    <div className="space-y-1">
      <Input
        id={step.id}
        type="tel"
        inputMode="tel"
        value={formatPhoneNumber(value)}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={config?.placeholder ?? "(555) 123-4567"}
        autoComplete="tel"
        disabled={readOnly}
        aria-describedby={describedBy !== "" ? describedBy : undefined}
        aria-required={required ? "true" : undefined}
        aria-invalid={hasError === true || showIdleError ? "true" : undefined}
      />
      {showIdleError && (
        <p id={idleErrorId} className="text-sm text-destructive" role="alert">{idleError}</p>
      )}
    </div>
  );
}
