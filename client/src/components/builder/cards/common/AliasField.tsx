/**
 * Alias Field Component
 * Editable variable name field for all block types
 */

import { AlertCircle } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AliasFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
}

export function AliasField({ value, onChange, placeholder = "variable_name" }: AliasFieldProps) {
  const [localValue, setLocalValue] = useState(value || "");
  const [error, setError] = useState<string | null>(null);
  const lastSubmittedValue = useRef(value);

  // Sync local value with prop, but be resilient to "rollbacks" on validation error
  useEffect(() => {
    // If the incoming value is different from what we have locally...
    if (value !== localValue) {
      // ...check if we just submitted our current local value.
      // If we did, and the incoming value is DIFFERENT (e.g., the server rejected it and sent back the old value),
      // we ignore the update to prevent the UI from "reverting" while the user is typing/thinking.
      const isRollback = localValue === lastSubmittedValue.current && value !== lastSubmittedValue.current;

      if (!isRollback) {
        setLocalValue(value || "");
      }
    }
    // Always update the ref if the prop changes to something new that matches our current state (successful sync)
    if (value === localValue) {
      lastSubmittedValue.current = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const validateAlias = (alias: string): string | null => {
    if (!alias.trim()) {
      return null; // Empty is allowed
    }

    // Check if it starts with a letter or underscore
    if (!/^[a-zA-Z_]/.test(alias)) {
      return "Must start with a letter or underscore";
    }

    // Check if it contains only valid characters
    if (!/^[a-zA-Z0-9_.]+$/.test(alias)) {
      return "Can only contain letters, numbers, underscores, and dots";
    }

    return null;
  };

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    const validationError = validateAlias(newValue);
    setError(validationError);
  };

  const handleBlur = () => {
    const validationError = validateAlias(localValue);
    if (validationError) {
      setError(validationError);
      return;
    }

    const trimmedValue = localValue.trim();
    const finalValue = trimmedValue === "" ? null : trimmedValue;

    if (finalValue !== value) {
      lastSubmittedValue.current = finalValue; // Track what we are submitting
      onChange(finalValue);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        Variable Name
        <span className="text-muted-foreground font-normal ml-2">(optional)</span>
      </Label>
      <Input
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={error ? "border-destructive" : "font-mono"}
      />
      <p className="text-xs text-muted-foreground">
        Used to reference this value in logic and transformations
      </p>
      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
