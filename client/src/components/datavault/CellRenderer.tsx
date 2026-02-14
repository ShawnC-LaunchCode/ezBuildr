/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
/**
 * Cell Renderer Component (PR 7)
 * Renders editable cells based on column type
 * Supports: text, number, date, boolean
 * Future: email, url, reference fields
 */

import { useState, useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ApiDatavaultRowWithValues } from "@/lib/datavault-api";
import type { DatavaultColumn, SelectOption } from "@/lib/types/datavault";

import { ReferenceCell } from "./ReferenceCell";

interface CellRendererProps {
  row: ApiDatavaultRowWithValues;
  column: DatavaultColumn;
  editing: boolean;
  onCommit: (value: unknown) => void;
  onCancel?: () => void;
  batchReferencesData?: Record<string, { displayValue: string; row: unknown }>;
}

// Helper: Render value based on column type (display mode)
function renderValue(value: unknown, type: string): string {
  if (value === null || value === undefined) {return "";}

  switch (type) {
    case "boolean":
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      return value ? "Yes" : "No";
    case "date":
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (value) {
        const date = new Date(value as string | number | Date);
        return date.toLocaleDateString();
      }
      return "";
    case "datetime":
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (value) {
        const date = new Date(value as string | number | Date);
        return date.toLocaleString();
      }
      return "";
    case "number":
    case "auto_number":
      return typeof value === "number" ? value.toString() : String(value);
    default:
      return String(value);
  // eslint-disable-next-line complexity
  }
}

// eslint-disable-next-line complexity
export function CellRenderer({ row, column, editing, onCommit, onCancel, batchReferencesData }: CellRendererProps) {
  const value = row.values[column.id];
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update edit value when row value changes
  useEffect(() => {
    setEditValue(value);
  }, [value]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    onCommit(editValue);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditValue(value); // Revert
      onCancel?.();
    }
  };

  // Display mode
  if (!editing) {
    // Special handling for reference types
    if (column.type === "reference") {
      return <ReferenceCell value={value} column={column} batchData={batchReferencesData} />;
    }

    // Special handling for boolean types
    if (column.type === "boolean") {
      return (
        <div className="flex items-center">
          <Checkbox checked={!!value} disabled aria-label={column.name} />
        </div>
      );
    }

    // Special handling for select types
    if (column.type === "select" && value) {
      const option = column.options?.find(opt => opt.value === value);
      if (option) {
        const colorVar = option.color ?? 'blue';
        return (
          <Badge
            variant="outline"
            className="max-w-full truncate dark:border-opacity-50"
            style={{
              backgroundColor: `hsl(var(--${colorVar}-100) / 0.15)`,
              color: `hsl(var(--${colorVar}-700) / 1)`,
              borderColor: `hsl(var(--${colorVar}-300) / 0.5)`
            }}
            title={option.label}
          >
            {option.label}
          </Badge>
        );
      }
      return <span className="text-muted-foreground">{value}</span>;
    }

    // Special handling for multiselect types
    if (column.type === "multiselect" && Array.isArray(value) && value.length > 0) {
      const options = value.map(val => column.options?.find(opt => opt.value === val)).filter(Boolean);
      return (
        <div className="flex flex-wrap gap-1">
          {options.map((option, idx) => {
            const colorVar = option?.color ?? 'blue';
            return (
              <Badge
                key={idx}
                variant="outline"
                className="max-w-[150px] truncate dark:border-opacity-50"
                style={{
                  backgroundColor: `hsl(var(--${colorVar}-100) / 0.15)`,
                  color: `hsl(var(--${colorVar}-700) / 1)`,
                  borderColor: `hsl(var(--${colorVar}-300) / 0.5)`
                }}
                title={option?.label}
              >
                {option?.label}
              </Badge>
            );
          })}
        </div>
      );
    }

    return (
      <span className="truncate block" title={renderValue(value, column.type)}>
        {renderValue(value, column.type)}
      </span>
    );
  }

  // Edit mode - render appropriate input based on column type
  switch (column.type) {
    case "text":
    case "email":
    case "url":
      return (
        <EditableTextCell
          value={editValue}
          type={column.type}
          onCommit={onCommit}
          onChange={setEditValue}
          onKeyDown={handleKeyDown}
          inputRef={inputRef}
        />
      );

    case "number":
    case "auto_number":
      return (
        <NumberCell
          value={editValue}
          onCommit={onCommit}
          onChange={setEditValue}
          onKeyDown={handleKeyDown}
          inputRef={inputRef}
          readOnly={column.type === "auto_number"}
        />
      );

    case "boolean":
      return (
        <BooleanCell
          value={editValue}
          onCommit={onCommit}
        />
      );

    case "date":
      return (
        <DateCell
          value={editValue}
          onCommit={onCommit}
          onChange={setEditValue}
          onKeyDown={handleKeyDown}
          inputRef={inputRef}
        />
      );

    case "datetime":
      return (
        <DateTimeCell
          value={editValue}
          onCommit={onCommit}
          onChange={setEditValue}
          onKeyDown={handleKeyDown}
          inputRef={inputRef}
        />
      );

    case "reference":
      // Reference columns are read-only for now
      return <ReferenceCell value={editValue} column={column} />;

    case "select":
      return (
        <SelectCell
          value={editValue}
          options={column.options ?? []}
          onCommit={onCommit}
        />
      );

    case "multiselect":
      return (
        <MultiselectCell
          value={editValue}
          options={column.options ?? []}
          onCommit={onCommit}
        />
      );

    default:
      return <span className="text-muted-foreground">Unsupported type: {column.type}</span>;
  }
}

// Editable Text Cell
function EditableTextCell({
  value,
  type,
  onCommit,
  onChange,
  onKeyDown,
  inputRef
}: {
  value: unknown;
  type: string;
  onCommit: (v: unknown) => void;
  onChange: (v: unknown) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  inputRef: RefObject<HTMLInputElement>;
}) {
  return (
    <Input
      ref={inputRef}
      type={type === "email" ? "email" : type === "url" ? "url" : "text"}
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={onKeyDown}
      className="h-8 text-sm"
    />
  );
}

// Number Cell
function NumberCell({
  value,
  onCommit,
  onChange,
  onKeyDown,
  inputRef,
  readOnly = false
}: {
  value: unknown;
  onCommit: (v: unknown) => void;
  onChange: (v: unknown) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  inputRef: RefObject<HTMLInputElement>;
  readOnly?: boolean;
}) {
  return (
    <Input
      ref={inputRef}
      type="number"
      value={(value as string | number) ?? ""}
      onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
      onBlur={() => onCommit(value)}
      onKeyDown={onKeyDown}
      disabled={readOnly}
      className="h-8 text-sm"
    />
  );
}

// Boolean Cell
function BooleanCell({
  value,
  onCommit
}: {
  value: unknown;
  onCommit: (v: unknown) => void;
}) {
  return (
    <div className="flex items-center">
      <Checkbox
        checked={!!value}
        onCheckedChange={(checked) => onCommit(checked)}
        aria-label="Toggle value"
      />
    </div>
  );
}

// Date Cell
function DateCell({
  value,
  onCommit,
  onChange,
  onKeyDown,
  inputRef
}: {
  value: unknown;
  onCommit: (v: unknown) => void;
  onChange: (v: unknown) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  inputRef: RefObject<HTMLInputElement>;
}) {
  // Convert to YYYY-MM-DD format
  const dateValue = value ? new Date(value as string | number | Date).toISOString().split('T')[0] : "";

  return (
    <Input
      ref={inputRef}
      type="date"
      value={dateValue}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={onKeyDown}
      className="h-8 text-sm"
    />
  );
}

// DateTime Cell
function DateTimeCell({
  value,
  onCommit,
  onChange,
  onKeyDown,
  inputRef
}: {
  value: unknown;
  onCommit: (v: unknown) => void;
  onChange: (v: unknown) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  inputRef: RefObject<HTMLInputElement>;
}) {
  // Convert to datetime-local format (YYYY-MM-DDThh:mm)
  const dateTimeValue = value
    ? new Date(value as string | number | Date).toISOString().slice(0, 16)
    : "";

  return (
    <Input
      ref={inputRef}
      type="datetime-local"
      value={dateTimeValue}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={onKeyDown}
      className="h-8 text-sm"
    />
  );
}

// Select Cell
function SelectCell({
  value,
  options,
  onCommit
}: {
  value: unknown;
  options: SelectOption[];
  onCommit: (v: unknown) => void;
}) {
  return (
    <Select value={(value as string) ?? ""} onValueChange={onCommit}>
      <SelectTrigger className="h-8 text-sm focus:ring-2 focus:ring-primary">
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="focus:bg-accent focus:text-accent-foreground cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: `hsl(var(--${option.color ?? 'blue'}-500) / 1)` }}
              />
              <span className="truncate max-w-[200px]" title={option.label}>
                {option.label}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Multiselect Cell
function MultiselectCell({
  value,
  options,
  onCommit
}: {
  value: unknown;
  options: SelectOption[];
  onCommit: (v: unknown) => void;
}) {
  const [selectedValues, setSelectedValues] = useState<string[]>(Array.isArray(value) ? value : []);

  const toggleValue = (optionValue: string) => {
    const newValues = selectedValues.includes(optionValue)
      ? selectedValues.filter(v => v !== optionValue)
      : [...selectedValues, optionValue];
    setSelectedValues(newValues);
    onCommit(newValues);
  };

  const handleKeyDownOption = (e: KeyboardEvent, optionValue: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleValue(optionValue);
    }
  };

  const selectedOptions = selectedValues.map(val => options.find(opt => opt.value === val)).filter(Boolean) as SelectOption[];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-8 text-sm justify-start w-full focus:ring-2 focus:ring-primary">
          {selectedOptions.length > 0 ? (
            <div className="flex flex-wrap gap-1 max-w-full">
              {selectedOptions.map((option, idx) => (
                <Badge key={idx} variant="outline" className="text-xs max-w-[100px] truncate" title={option.label}>
                  {option.label}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">Select...</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 max-h-80 overflow-y-auto">
        <div className="space-y-1">
          {options.map((option) => (
            <div
              key={option.value}
              className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer focus-within:bg-accent transition-colors"
              onClick={() => toggleValue(option.value)}
              onKeyDown={(e) => handleKeyDownOption(e, option.value)}
              tabIndex={0}
              role="option"
              aria-selected={selectedValues.includes(option.value)}
            >
              <Checkbox
                checked={selectedValues.includes(option.value)}
                onCheckedChange={() => toggleValue(option.value)}
                tabIndex={-1}
              />
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: `hsl(var(--${option.color ?? 'blue'}-500) / 1)` }}
              />
              <span className="text-sm truncate flex-1" title={option.label}>
                {option.label}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
