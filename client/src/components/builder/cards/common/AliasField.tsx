/**
 * Alias Field Component
 * Editable variable name field for all block types
 */

import { AlertCircle } from "lucide-react";
import { useState, useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkflowSteps } from "@/hooks/api/useSteps";

interface AliasFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  workflowId?: string;
  currentStepId?: string;
}

export function AliasField({ value, onChange, placeholder = "variable_name", workflowId, currentStepId }: AliasFieldProps) {
  const [localValue, setLocalValue] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const lastSubmittedValue = useRef(value);
  const { data: workflowSteps = [] } = useWorkflowSteps(workflowId, {
    enabled: Boolean(workflowId),
    staleTime: 5000,
  });

  // Sync local value with prop, but be resilient to "rollbacks" on validation error
  useEffect(() => {
    // If the incoming value is different from what we have locally...
    if (value !== localValue) {
      // ...check if we just submitted our current local value.
      // If we did, and the incoming value is DIFFERENT (e.g., the server rejected it and sent back the old value),
      // we ignore the update to prevent the UI from "reverting" while the user is typing/thinking.
      const isRollback = localValue === lastSubmittedValue.current && value !== lastSubmittedValue.current;

      if (!isRollback) {
        setLocalValue(value ?? "");
      }
    }
    // Always update the ref if the prop changes to something new that matches our current state (successful sync)
    if (value === localValue) {
      lastSubmittedValue.current = value;
    }

  }, [value]);

  const validateAlias = (alias: string): string | null => {
    if (!alias.trim()) {
      return null; // Empty is allowed
    }

    // Check if it starts with a letter or underscore
    if (!/^[a-zA-Z_]/.test(alias)) {
      return "Must start with a letter or underscore";
    }

    // Dots are not allowed in new variable names: they collide with the
    // dot-notation keys documents use for nested values (address.city)
    if (!/^[a-zA-Z0-9_]+$/.test(alias)) {
      return "Can only contain letters, numbers, and underscores";
    }

    const normalizedAlias = alias.trim().toLowerCase();
    const duplicate = workflowSteps.some((step) =>
      step.id !== currentStepId && (step.alias ?? "").trim().toLowerCase() === normalizedAlias
    );
    if (duplicate) {
      return "Variable name must be unique in this workflow";
    }

    return null;
  };

  useEffect(() => {
    setError(validateAlias(localValue));

  }, [localValue, workflowSteps, currentStepId]);

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
        Used in documents ({"{{name}}"}), logic, and transformations.
        Generated from the question label until you customize it.
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
