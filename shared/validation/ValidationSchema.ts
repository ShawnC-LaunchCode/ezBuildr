import { ValidationRule } from "./ValidationRule";

export interface ValidationSchema {
    rules: ValidationRule[];
    // If true, overrides the required rule in the rules array (shorthand)
    required?: boolean;
    // Custom message for the required rule shorthand
    requiredMessage?: string;
}

// Extends the detailed validation logic to support per-field validation in complex blocks
export interface BlockValidationSchema extends ValidationSchema {
    // map of sub-field key to schema (e.g., address.zip, multi_field.firstName)
    fields?: Record<string, ValidationSchema>;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[]; // List of error messages
    // If validation failed on sub-fields, map them here
    fieldErrors?: Record<string, string[]>;
}

export interface PageValidationResult {
    valid: boolean;
    // Map of blockId -> error messages
    blockErrors: Record<string, string[]>;
}
