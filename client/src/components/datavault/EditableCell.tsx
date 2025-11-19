/**
 * Editable Cell Component
 * Inline editable cell with auto-save on blur/enter
 * Supports different input types based on column type
 * Enhanced with loading states, error handling, and accessibility
 */

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { DatavaultColumn } from "@shared/schema";

interface EditableCellProps {
  column: DatavaultColumn;
  value: any;
  onSave: (value: any) => Promise<void>;
  readOnly?: boolean;
}

export function EditableCell({ column, value, onSave, readOnly = false }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update editValue when value prop changes
  useEffect(() => {
    setEditValue(value);
  }, [value]);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditValue(value);
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  // Format display value based on column type
  const formatDisplayValue = (val: any) => {
    if (val === null || val === undefined) return "";

    switch (column.type) {
      case "boolean":
      case "yes_no":
        return val ? "Yes" : "No";
      case "date":
        if (val) {
          const date = new Date(val);
          return date.toLocaleDateString();
        }
        return "";
      case "datetime":
        if (val) {
          const date = new Date(val);
          return date.toLocaleString();
        }
        return "";
      case "number":
        return typeof val === "number" ? val.toString() : val;
      default:
        return val.toString();
    }
  };

  // Render checkbox for boolean types
  if ((column.type === "boolean" || column.type === "yes_no") && !isEditing) {
    return (
      <div
        className={cn(
          "px-3 py-2 min-h-[40px] flex items-center gap-2",
          !readOnly && "cursor-pointer hover:bg-accent/50",
          error && "bg-destructive/10 border-l-2 border-destructive"
        )}
        onDoubleClick={handleDoubleClick}
        role="gridcell"
        aria-label={`${column.name}: ${value ? "Yes" : "No"}${readOnly ? " (read-only)" : ""}`}
      >
        {isSaving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground flex-shrink-0" />}
        <Checkbox
          checked={!!value}
          onCheckedChange={(checked) => {
            if (!readOnly) {
              onSave(checked);
            }
          }}
          disabled={readOnly || isSaving}
          aria-label={column.name}
        />
        {error && <span className="text-xs text-destructive flex-shrink-0">Error</span>}
      </div>
    );
  }

  // Display mode
  if (!isEditing) {
    return (
      <div
        className={cn(
          "px-3 py-2 min-h-[40px] flex items-center gap-2 group",
          !readOnly && "cursor-pointer hover:bg-accent/50 transition-colors",
          error && "bg-destructive/10 border-l-2 border-destructive"
        )}
        onDoubleClick={handleDoubleClick}
        title={error || (readOnly ? "" : "Double-click to edit")}
        role="gridcell"
        aria-label={`${column.name}: ${formatDisplayValue(value)}${readOnly ? " (read-only)" : ""}`}
        tabIndex={readOnly ? -1 : 0}
        onKeyDown={(e) => {
          if (!readOnly && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            handleDoubleClick();
          }
        }}
      >
        {isSaving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground flex-shrink-0" />}
        <span className={cn("truncate flex-1", isSaving && "opacity-50")}>
          {formatDisplayValue(value)}
        </span>
        {error && <span className="text-xs text-destructive flex-shrink-0">Error</span>}
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
        value={editValue || ""}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        disabled={isSaving}
        className="h-9"
        aria-label={`Edit ${column.name}`}
        placeholder={`Enter ${column.name.toLowerCase()}`}
      />
    </div>
  );
}
