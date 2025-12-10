/**
 * Label Field Component
 * Editable label/title field for all block types
 */

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LabelFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
}

export function LabelField({ value, onChange, placeholder = "Enter question text..." }: LabelFieldProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleBlur = () => {
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Question Text</Label>
      {/* description prop is currently unused in UI but exists for compatibility */}
      <Input
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="font-medium"
      />
    </div>
  );
}
