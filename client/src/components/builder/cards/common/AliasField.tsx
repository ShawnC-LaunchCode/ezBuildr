/**
 * Alias Field Component
 * Editable variable name field for all block types
 */

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

interface AliasFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
}

export function AliasField({ value, onChange, placeholder = "variable_name" }: AliasFieldProps) {
  const [localValue, setLocalValue] = useState(value || "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalValue(value || "");
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
    if (!/^[a-zA-Z0-9_]+$/.test(alias)) {
      return "Can only contain letters, numbers, and underscores";
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
