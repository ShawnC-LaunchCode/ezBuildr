/**
 * Block Validation Utilities
 *
 * Validates block values before section submission.
 * Handles all block types with proper nested data validation.
 */

import type { Step } from "@/types";
import type {
  AddressValue,
  MultiFieldValue,
  MultiFieldConfig,
} from "@/../../shared/types/stepConfigs";

/**
 * Validate a single step/block value
 * Returns error message if invalid, null if valid
 */
export function validateBlockValue(step: Step, value: any, required: boolean): string | null {
  // Required check
  if (required) {
    if (value === null || value === undefined || value === "") {
      return `${step.title} is required`;
    }

    // Check empty arrays (multiple choice)
    if (Array.isArray(value) && value.length === 0) {
      return `${step.title} requires at least one selection`;
    }

    // Check nested objects (address, multi-field)
    if (typeof value === "object" && !Array.isArray(value)) {
      // Address validation
      if (step.type === "address") {
        const addr = value as AddressValue;
        if (!addr.street || !addr.city || !addr.state || !addr.zip) {
          return `${step.title} requires all address fields`;
        }
      }

      // Multi-field validation
      if (step.type === "multi_field") {
        const config = step.config as MultiFieldConfig;
        const multiValue = value as MultiFieldValue;

        for (const field of config?.fields || []) {
          if (field.required && !multiValue[field.key]) {
            return `${field.label} is required`;
          }
        }
      }
    }
  }

  // Type-specific validation
  switch (step.type) {
    case "email":
      if (value && typeof value === "string") {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return "Invalid email address";
        }
      }
      break;

    case "phone":
      if (value && typeof value === "string") {
        const phoneDigits = value.replace(/\D/g, "");
        if (phoneDigits.length !== 10) {
          return "Phone number must be 10 digits";
        }
      }
      break;

    case "website":
      if (value && typeof value === "string") {
        try {
          new URL(value);
        } catch {
          return "Invalid URL";
        }
      }
      break;

    case "number":
    case "currency":
      if (value !== null && value !== undefined) {
        const config = step.config as any;
        const num = typeof value === "number" ? value : parseFloat(value);

        if (isNaN(num)) {
          return "Invalid number";
        }

        if (config?.min !== undefined && num < config.min) {
          return `Value must be at least ${config.min}`;
        }

        if (config?.max !== undefined && num > config.max) {
          return `Value must be at most ${config.max}`;
        }
      }
      break;

    case "multi_field":
      if (value && typeof value === "object") {
        const config = step.config as MultiFieldConfig;
        const multiValue = value as MultiFieldValue;

        // Date range validation
        if (config?.layout === "date_range") {
          if (multiValue.start && multiValue.end && multiValue.start > multiValue.end) {
            return "End date must be after start date";
          }
        }
      }
      break;
  }

  return null;
}

/**
 * Validate all steps in a section
 * Returns map of stepId -> error message
 */
export function validateSectionSteps(
  steps: Step[],
  values: Record<string, any>,
  requiredMap: Record<string, boolean>
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const step of steps) {
    // Skip virtual steps and display blocks
    if (step.isVirtual || step.type === "display" || step.type === "js_question") {
      continue;
    }

    const value = values[step.id];
    const required = requiredMap[step.id] ?? step.required;

    const error = validateBlockValue(step, value, required);
    if (error) {
      errors[step.id] = error;
    }
  }

  return errors;
}
