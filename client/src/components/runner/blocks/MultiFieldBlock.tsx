/**
 * MultiFieldBlockRenderer - Multi-Field Input
 *
 * Handles grouped fields:
 * - first_last: First + Last Name
 * - contact: Email + Phone
 * - date_range: Start Date + End Date
 * - custom: User-defined fields
 *
 * Storage Format (nested JSON under step.alias):
 * {
 *   first: "Alice",
 *   last: "Smith"
 * }
 *
 * OR
 *
 * {
 *   email: "alice@example.com",
 *   phone: "5551234567"
 * }
 */

import React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Step } from "@/types";

import type { MultiFieldConfig, MultiFieldValue } from "@/../../shared/types/stepConfigs";

export interface MultiFieldBlockProps {
  step: Step;
  value: any;
  onChange: (value: MultiFieldValue) => void;
  readOnly?: boolean;
}

export function MultiFieldBlockRenderer({ step, value, onChange, readOnly }: MultiFieldBlockProps) {
  const config = step.config as MultiFieldConfig;
  const layout = config?.layout || "first_last";
  const fields = config?.fields || [];

  // Parse current value (nested object)
  const currentValue: MultiFieldValue = value || {};

  // Update a single field
  const updateField = (fieldKey: string, newValue: string | number) => {
    onChange({
      ...currentValue,
      [fieldKey]: newValue,
    });
  };

  // Render field based on type
  const renderField = (field: any) => {
    const fieldValue = currentValue[field.key] || "";

    let inputType = "text";
    if (field.type === "email") {inputType = "email";}
    if (field.type === "phone") {inputType = "tel";}
    if (field.type === "date") {inputType = "date";}
    if (field.type === "number") {inputType = "number";}

    return (
      <div key={field.key} className="space-y-1">
        <Label htmlFor={`${step.id}-${field.key}`} className="text-sm">
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          id={`${step.id}-${field.key}`}
          type={inputType}
          value={String(fieldValue)}
          onChange={(e) => {
            const newValue = field.type === "number" ? parseFloat(e.target.value) : e.target.value;
            updateField(field.key, newValue);
          }}
          placeholder={field.placeholder || field.label}
          disabled={readOnly}
        />
      </div>
    );
  };

  // Layout-specific rendering
  if (layout === "first_last" || layout === "contact") {
    // Side-by-side layout
    return (
      <div className="grid grid-cols-2 gap-3">
        {fields.map((field) => renderField(field))}
      </div>
    );
  }

  if (layout === "date_range") {
    // Date range layout
    return (
      <div className="space-y-3">
        {fields.map((field) => renderField(field))}
        {/* Validation: start <= end */}
        {currentValue.start && currentValue.end && currentValue.start > currentValue.end && (
          <p className="text-sm text-destructive">End date must be after start date</p>
        )}
      </div>
    );
  }

  // Custom layout (vertical)
  return (
    <div className="space-y-3">
      {fields.map((field) => renderField(field))}
    </div>
  );
}
