import { ValidationSchema } from "./ValidationSchema";
import { ValidationRule } from "./ValidationRule";
import {
    StepConfig,
    TextAdvancedConfig,
    NumberAdvancedConfig,
    PhoneAdvancedConfig,
    EmailAdvancedConfig,
    WebsiteAdvancedConfig,
    ScaleAdvancedConfig,
    ChoiceAdvancedConfig,
    LegacyMultipleChoiceConfig,
    LegacyRadioConfig,
    DateTimeUnifiedConfig,
    DateConfig,
    AddressConfig,
    AddressAdvancedConfig,
    MultiFieldConfig,
    isNumberConfig,
    isChoiceConfig,
    isAddressConfig,
} from "../types/stepConfigs";

export interface StepLike {
    id: string;
    type: string;
    config: unknown;
    required?: boolean;
}

/**
 * Generates a runtime ValidationSchema from a step's type and configuration.
 */
export function getValidationSchema(step: StepLike): ValidationSchema {
    const rules: ValidationRule[] = [];
    const config = step.config as StepConfig;

    // Base requirement
    if (step.required) {
        rules.push({ type: "required" });
    }

    if (!config) {
        return { rules, required: step.required };
    }

    // Type-specific rules
    switch (step.type) {
        case "text": {
            // Advanced text
            const c = config as TextAdvancedConfig;
            if (c.validation) {
                if (c.validation.minLength) rules.push({ type: "minLength", value: c.validation.minLength });
                if (c.validation.maxLength) rules.push({ type: "maxLength", value: c.validation.maxLength });
                if (c.validation.pattern) {
                    rules.push({
                        type: "pattern",
                        regex: c.validation.pattern,
                        message: c.validation.patternMessage
                    });
                }
            }
            break;
        }

        case "short_text":
        case "long_text": {
            // Legacy or simple types
            const c = config as any;
            if (c.minLength) rules.push({ type: "minLength", value: c.minLength });
            if (c.maxLength) rules.push({ type: "maxLength", value: c.maxLength });
            break;
        }

        case "number":
        case "currency": {
            if (isNumberConfig(config)) {
                // Check if it is advanced config (has validation object)
                if ('validation' in config && config.validation) {
                    const adv = config as NumberAdvancedConfig;
                    if (adv.validation?.min !== undefined) rules.push({ type: "minValue", value: adv.validation.min });
                    if (adv.validation?.max !== undefined) rules.push({ type: "maxValue", value: adv.validation.max });
                } else {
                    // Simple config (min/max at root)
                    const simple = config as any; // Cast to access potential simple props
                    if (simple.min !== undefined) rules.push({ type: "minValue", value: simple.min });
                    if (simple.max !== undefined) rules.push({ type: "maxValue", value: simple.max });
                }
            }
            break;
        }

        case "email":
        case "email_advanced": {
            rules.push({ type: "email" });
            break;
        }

        case "website":
        case "website_advanced": {
            rules.push({ type: "url" });
            break;
        }

        case "phone":
        case "phone_advanced": {
            rules.push({ type: "pattern", regex: "^[+]?[(]?[0-9]{3}[)]?[-\\s.]?[0-9]{3}[-\\s.]?[0-9]{4,6}$", message: "Invalid phone number" });
            break;
        }

        case "choice":
        case "multiple_choice": {
            // Check for min/max selections
            const c = config as any;
            if (c.min) rules.push({ type: "minLength", value: c.min });
            if (c.max) rules.push({ type: "maxLength", value: c.max });
            if (c.minSelections) rules.push({ type: "minLength", value: c.minSelections });
            if (c.maxSelections) rules.push({ type: "maxLength", value: c.maxSelections });
            break;
        }
    }

    return {
        rules,
        required: step.required
    };
}
