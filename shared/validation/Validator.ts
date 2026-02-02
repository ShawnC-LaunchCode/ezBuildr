import { evaluateConditionExpression } from "../conditionEvaluator";

import { defaultValidationMessages, formatMessage } from "./messages";

import type { ValidationRule } from "./ValidationRule";
import type { ValidationSchema, ValidationResult } from "./ValidationSchema";
/**
 * Validator Options
 */
export interface ValidatorOptions {
    schema: ValidationSchema;
    value: unknown;
    /**
     * Complete dataset/variables for conditional logic evaluation.
     * Required for 'conditional' rules.
     */
    values?: Record<string, unknown>;
    /**
     * Helper functions or context for scripts (unused in basic validator but ready for extension)
     */
    helpers?: unknown;
}
/**
 * Validates a single value against a schema.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- kept async for future script validation support
export async function validateValue(options: ValidatorOptions): Promise<ValidationResult> {
    const { schema, value, values = {} } = options;
    const errors: string[] = [];
    // Check required/empty first
    const isEmpty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    // Apply "Required" shorthand from schema
    if (schema.required && isEmpty) {
        // If required and empty, fail immediately (other rules usually don't apply to empty values)
        errors.push(schema.requiredMessage ?? defaultValidationMessages.required);
        return { valid: false, errors };
    }
    // If empty and not required, skip other rules (typically)
    if (isEmpty && !schema.required) {
        return { valid: true, errors: [] };
    }
    // Iterate over explicit rules
    for (const rule of schema.rules) {
        const error = validateRule(rule, value, values);
        if (error !== null) {
            errors.push(error);
        }
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
/**
 * Validates a single rule.
 * Returns error string if invalid, null if valid.
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- rule dispatch table
function validateRule(
    rule: ValidationRule,
    value: unknown,
    values: Record<string, unknown>
): string | null {
    const msg = rule.message ?? defaultValidationMessages[rule.type];
    switch (rule.type) {
        case "required":
            if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
                return formatMessage(msg, {});
            }
            break;
        case "minLength":
            if ((typeof value === "string" || Array.isArray(value)) && value.length < rule.value) {
                return formatMessage(msg, { value: rule.value, actual: value.length });
            }
            break;
        case "maxLength":
            if ((typeof value === "string" || Array.isArray(value)) && value.length > rule.value) {
                return formatMessage(msg, { value: rule.value, actual: value.length });
            }
            break;
        case "minValue":
            if (typeof value === "number" && value < rule.value) {
                return formatMessage(msg, { value: rule.value, actual: value });
            }
            break;
        case "maxValue":
            if (typeof value === "number" && value > rule.value) {
                return formatMessage(msg, { value: rule.value, actual: value });
            }
            break;
        case "pattern":
            if (typeof value === "string") {
                try {
                    // eslint-disable-next-line security/detect-non-literal-regexp -- regex comes from validated schema, not user input
                    const regex = new RegExp(rule.regex);
                    if (!regex.test(value)) {
                        return formatMessage(msg, { regex: rule.regex });
                    }
                } catch {
                    console.error("Invalid regex in validation rule", rule.regex);
                    // Don't fail validation for broken regex, just log
                }
            }
            break;
        case "email":
            if (typeof value === "string") {
                // Basic email regex
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    return formatMessage(msg, {});
                }
            }
            break;
        case "url":
            if (typeof value === "string") {
                try {
                    new URL(value);
                } catch {
                    return formatMessage(msg, {});
                }
            }
            break;
        case "maxDecimalPlaces":
            if (typeof value === "number" || typeof value === "string") {
                const strVal = String(value);
                if (strVal.includes(".")) {
                    const decimals = strVal.split(".")[1];
                    if (decimals && decimals.length > rule.value) {
                        return formatMessage(msg, { value: rule.value });
                    }
                }
            }
            break;
        case "conditional":
            if (rule.condition) {
                // Use structured condition evaluator
                const met = evaluateConditionExpression(rule.condition, values);
                if (!met) {
                    return formatMessage(msg, {});
                }
            } else if (rule.expression) {
                console.warn("String expression validation not implemented yet on client", rule.expression);
            }
            break;
        case "script":
            // Script rules typically require server-side execution or async hook
            console.warn("Script validation rule skipped on client");
            break;
    }
    return null;
}
