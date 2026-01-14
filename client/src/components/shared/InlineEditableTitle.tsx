import React, { useState, useRef, useEffect } from "react";

import { Input } from "@/components/ui/input";

interface InlineEditableTitleProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onEnterKey?: () => void;
}

export function InlineEditableTitle({
  value,
  onSave,
  className = "",
  placeholder = "Enter title...",
  autoFocus = false,
  onEnterKey,
}: InlineEditableTitleProps) {
  const [isEditing, setIsEditing] = useState(autoFocus);
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmedValue = localValue.trim();
    console.log('[InlineEditableTitle] handleSave called', {
      originalValue: value,
      newValue: trimmedValue,
      isDifferent: trimmedValue !== value,
      willSave: trimmedValue && trimmedValue !== value
    });

    if (trimmedValue && trimmedValue !== value) {
      console.log('[InlineEditableTitle] Calling onSave with:', trimmedValue);
      onSave(trimmedValue);
    } else if (!trimmedValue) {
      console.log('[InlineEditableTitle] Empty value, reverting');
      setLocalValue(value); // Revert if empty
    } else {
      console.log('[InlineEditableTitle] No change detected, not saving');
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
      if (onEnterKey) {
        onEnterKey();
      }
    } else if (e.key === "Escape") {
      setLocalValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`border-b-2 border-blue-500 focus-visible:ring-0 ${className}`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`hover:text-blue-500 cursor-pointer transition-colors ${className}`}
      title="Click to edit"
    >
      {value || placeholder}
    </span>
  );
}
