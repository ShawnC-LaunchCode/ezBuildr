import React, { useState, useRef, useEffect, KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  className,
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

    if (trimmedValue && trimmedValue !== value) {
      onSave(trimmedValue);
    } else if (!trimmedValue) {
      setLocalValue(value); // Revert if empty
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
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
        className={cn("border-b-2 border-primary focus-visible:ring-0", className)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className={cn(
        "hover:text-primary cursor-pointer transition-colors bg-transparent border-none p-0 text-left font-inherit",
        className
      )}
      title="Click to edit"
      aria-label="Edit title"
    >
      {value || placeholder}
    </button>
  );
}
