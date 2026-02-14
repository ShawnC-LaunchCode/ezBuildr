/**
 * Editable Cell Component
 * Inline editable cell with auto-save on blur/enter
 * Supports different input types based on column type
 * Enhanced with loading states, error handling, and accessibility
 */

import { Loader2 } from "lucide-react";
import { useState, useEffect, useRef, type KeyboardEvent } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { DatavaultColumn } from "@shared/schema";

interface EditableCellProps {
  column: DatavaultColumn;
  value: unknown;
  onSave: (value: unknown) => Promise<void>;
  readOnly?: boolean;
  placeholder?: string;
}

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity
export function EditableCell({ column, value, onSave, readOnly = false, placeholder }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update editValue when value prop changes
  useEffect(() => { setEditValue(value); }, [value]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    if (!readOnly) {
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    if (editValue === value) {
      setIsEditing(false);
      setError(null);
      return;
    }

    // Optimistic update: exit edit mode immediately for better UX
    setIsEditing(false);
    setIsSaving(true);
    setError(null);

    try {
      await onSave(editValue);
    } catch (error) {
      // Revert on error and show error message
      setEditValue(value);
      setError(error instanceof Error ? error.message : "Failed to save");
      console.error("Failed to save cell:", error);
      // Clear error after 3 seconds
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditValue(value);
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    void handleSave();
  };

  // Format display value based on column type
  const formatDisplayValue = (val: unknown) => {
    if (val === null || val === undefined) { return ""; }

    switch (column.type as string) {
      case "boolean":
      case "yes_no":
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        return val ? "Yes" : "No";
      case "date":
        if (val !== null && val !== undefined && val !== "") {
          const date = new Date(val as string | number | Date);
          return date.toLocaleDateString(undefined, { timeZone: 'UTC' });
        }
        return "";
      case "datetime":
        if (val !== null && val !== undefined && val !== "") {
          const date = new Date(val as string | number | Date);
          return date.toLocaleString();
        }
        return "";
      case "number":
        return typeof val === "number" ? val.toString() : String(val);
      default:
        return String(val);
    }
  };

  // Render checkbox for boolean types
  if (column.type === "boolean" && !isEditing) {
    return (
      <div
        className={cn(
          "px-3 py-2 min-h-[40px] flex items-center gap-2",
          !readOnly && "cursor-pointer hover:bg-accent/50",
          error && "bg-destructive/10 border-l-2 border-destructive"
        )}
        onDoubleClick={handleDoubleClick}
        role="gridcell"
        aria-label={`${column.name}: ${formatDisplayValue(value)}${readOnly ? " (read-only)" : ""}`}
      >
        {isSaving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground flex-shrink-0" />}
        <Checkbox
          checked={Boolean(value)}
          onCheckedChange={(checked) => {
            if (!readOnly) {
              setIsSaving(true);
              setError(null);
              onSave(checked).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Failed to save");
                setTimeout(() => setError(null), 3000);
              }).finally(() => {
                setIsSaving(false);
              });
            }
          }}
          disabled={readOnly || isSaving}
          aria-label={column.name}
        />
        {error !== null && <span className="text-xs text-destructive flex-shrink-0">Error</span>}
      </div>
    );
  }

  // Display mode - helper to check for empty values
  const isValuePresent = (val: unknown): boolean => {
    return val !== null && val !== undefined && val !== "";
  };

  if (!isEditing) {
    const displayValue = formatDisplayValue(value);
    const showPlaceholder = !isValuePresent(displayValue) && placeholder !== undefined;

    return (
      <div
        className={cn(
          "px-3 py-2 min-h-[40px] flex items-center gap-2 group",
          !readOnly && "cursor-pointer hover:bg-accent/50 transition-colors",
          error !== null && "bg-destructive/10 border-l-2 border-destructive"
        )}
        onDoubleClick={handleDoubleClick}
        title={error ?? (readOnly ? "" : "Double-click to edit")}
        role="gridcell"
        aria-label={`${column.name}: ${displayValue}${readOnly ? " (read-only)" : ""}`}
        tabIndex={readOnly ? -1 : 0}
        onKeyDown={(e) => {
          if (!readOnly && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            handleDoubleClick();
          }
        }}
      >
        {isSaving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground flex-shrink-0" />}
        <span className={cn("truncate flex-1", isSaving && "opacity-50", showPlaceholder && "text-muted-foreground italic")}>
          {showPlaceholder ? placeholder : displayValue}
        </span>
        {error !== null && <span className="text-xs text-destructive flex-shrink-0">Error</span>}
      </div>
    );
  }

  // Edit mode
  return (
    <div className="px-2 py-1">
      <Input
        ref={inputRef}
        type={
          column.type === "number"
            ? "number"
            : column.type === "email"
              ? "email"
              : column.type === "url"
                ? "url"
                : column.type === "date"
                  ? "date"
                  : column.type === "datetime"
                    ? "datetime-local"
                    : "text"
        }
        value={(editValue ?? "") as string}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        disabled={isSaving}
        className="h-9"
        aria-label={`Edit ${column.name}`}
        placeholder={placeholder ?? `Enter ${column.name.toLowerCase()}`}
      />
    </div>
  );
}
