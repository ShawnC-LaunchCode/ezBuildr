import { ValidationRuleType } from "./ValidationRule";

export const defaultValidationMessages: Record<ValidationRuleType, string> = {
    required: "This field is required",
    minLength: "Must be at least {value} characters",
    maxLength: "Must be no more than {value} characters",
    minValue: "Must be at least {value}",
    maxValue: "Must be no more than {value}",
    pattern: "Invalid format",
    email: "Please enter a valid email address",
    url: "Please enter a valid URL",
    maxDecimalPlaces: "Must have no more than {value} decimal places",
    conditional: "Condition not met",
    script: "Validation failed",
    custom: "Invalid value"
};

export function formatMessage(message: string, params: Record<string, unknown>): string {
    let formatted = message;
    for (const [key, value] of Object.entries(params)) {
        formatted = formatted.replace(new RegExp(`{${key}}`, "g"), String(value));
    }
    return formatted;
}
