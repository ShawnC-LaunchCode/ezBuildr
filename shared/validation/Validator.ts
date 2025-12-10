import { ValidationSchema, ValidationResult } from "./ValidationSchema";
import { ValidationRule, ValidationRuleType } from "./ValidationRule";
import { defaultValidationMessages, formatMessage } from "./messages";
import { evaluateConditionExpression } from "../conditionEvaluator";

/**
 * Validator Options
 */
export interface ValidatorOptions {
    schema: ValidationSchema;
    value: any;
    /**
     * Complete dataset/variables for conditional logic evaluation.
     * Required for 'conditional' rules.
     */
    values?: Record<string, any>;
    /**
     * Helper functions or context for scripts (unused in basic validator but ready for extension)
     */
    helpers?: any;
}

/**
 * Validates a single value against a schema.
 */
export async function validateValue(options: ValidatorOptions): Promise<ValidationResult> {
    const { schema, value, values = {} } = options;
    const errors: string[] = [];

    // Check required/empty first
    const isEmpty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

    // Apply "Required" shorthand from schema
    if (schema.required && isEmpty) {
        // If required and empty, fail immediately (other rules usually don't apply to empty values)
        errors.push(schema.requiredMessage || defaultValidationMessages.required);
        return { valid: false, errors };
    }

    // If empty and not required, skip other rules (typically)
    if (isEmpty && !schema.required) {
        return { valid: true, errors: [] };
    }

    // Iterate over explicit rules
    for (const rule of schema.rules) {
        const error = await validateRule(rule, value, values);
        if (error) {
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
async function validateRule(
    rule: ValidationRule,
    value: any,
    values: Record<string, any>
): Promise<string | null> {
    const msg = rule.message || defaultValidationMessages[rule.type];

    switch (rule.type) {
        case "required":
            if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
                return formatMessage(msg, {});
            }
            break;

        case "minLength":
            if (typeof value === "string" || Array.isArray(value)) {
                if (value.length < rule.value) {
                    return formatMessage(msg, { value: rule.value, actual: value.length });
                }
            }
            break;

        case "maxLength":
            if (typeof value === "string" || Array.isArray(value)) {
                if (value.length > rule.value) {
                    return formatMessage(msg, { value: rule.value, actual: value.length });
                }
            }
            break;

        case "minValue":
            if (typeof value === "number") {
                if (value < rule.value) {
                    return formatMessage(msg, { value: rule.value, actual: value });
                }
            }
            break;

        case "maxValue":
            if (typeof value === "number") {
                if (value > rule.value) {
                    return formatMessage(msg, { value: rule.value, actual: value });
                }
            }
            break;

        case "pattern":
            if (typeof value === "string") {
                try {
                    const regex = new RegExp(rule.regex);
                    if (!regex.test(value)) {
                        return formatMessage(msg, { regex: rule.regex });
                    }
                } catch (e) {
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

        case "conditional":
            if (rule.condition) {
                // Use structured condition evaluator
                const met = evaluateConditionExpression(rule.condition, values);
                if (!met) {
                    // If condition is NOT met, what does it mean?
                    // Usually "conditional" rule means: "This rule applies IF condition is met..."
                    // Wait. The prompt says: "if (age < 18) then required(parentName)"
                    // This implies the rule ITSELF is conditionally applied.
                    // BUT `ValidationRule` structure is `{ type: "conditional", expression: ... }`.
                    // That structure suggests the validation FAILS if the expression is false?
                    // OR does it mean "This field is valid ONLY IF expression is true"?

                    // Interpret "conditional" validation rule as: "Assertions that must be true".
                    // So if expression evaluates to FALSE, it is an ERROR.
                    return formatMessage(msg, {});
                }
            } else if (rule.expression) {
                // TODO: DSL string parsing
                // For now, naive eval or skip
                console.warn("String expression validation not implemented yet on client", rule.expression);
            }
            break;

        case "script":
            // Script rules typically require server-side execution or async hook
            // On client, we might skip or mark as "pending sync"
            // For this synchronous/client-side focused validator, we might skip
            console.warn("Script validation rule skipped on client");
            break;


    }

    return null;
}
