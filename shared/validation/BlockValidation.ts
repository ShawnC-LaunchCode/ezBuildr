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

import { ValidationRule } from "./ValidationRule";
import { ValidationSchema } from "./ValidationSchema";

export interface StepLike {
    id: string;
    type: string;
    config: unknown;
    required?: boolean;
}

/**
 * Type guard helpers for config validation
 */
interface SimpleTextConfig {
    minLength?: number;
    maxLength?: number;
}

interface SimpleNumberConfig {
    min?: number;
    max?: number;
}

interface SimpleChoiceConfig {
    min?: number;
    max?: number;
    minSelections?: number;
    maxSelections?: number;
}

function hasTextConstraints(config: unknown): config is SimpleTextConfig {
    return typeof config === 'object' && config !== null;
}

function hasNumberConstraints(config: unknown): config is SimpleNumberConfig {
    return typeof config === 'object' && config !== null;
}

function hasChoiceConstraints(config: unknown): config is SimpleChoiceConfig {
    return typeof config === 'object' && config !== null;
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
                if (c.validation.minLength) {rules.push({ type: "minLength", value: c.validation.minLength });}
                if (c.validation.maxLength) {rules.push({ type: "maxLength", value: c.validation.maxLength });}
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
            if (hasTextConstraints(config)) {
                if (config.minLength) {rules.push({ type: "minLength", value: config.minLength });}
                if (config.maxLength) {rules.push({ type: "maxLength", value: config.maxLength });}
            }
            break;
        }

        case "number":
        case "currency": {
            if (isNumberConfig(config)) {
                // Check if it is advanced config (has validation object)
                if ('validation' in config && config.validation) {
                    const adv = config;
                    if (adv.validation?.min !== undefined) {rules.push({ type: "minValue", value: adv.validation.min });}
                    if (adv.validation?.max !== undefined) {rules.push({ type: "maxValue", value: adv.validation.max });}
                } else if (hasNumberConstraints(config)) {
                    // Simple config (min/max at root)
                    if (config.min !== undefined) {rules.push({ type: "minValue", value: config.min });}
                    if (config.max !== undefined) {rules.push({ type: "maxValue", value: config.max });}
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
            if (hasChoiceConstraints(config)) {
                if (config.min) {rules.push({ type: "minLength", value: config.min });}
                if (config.max) {rules.push({ type: "maxLength", value: config.max });}
                if (config.minSelections) {rules.push({ type: "minLength", value: config.minSelections });}
                if (config.maxSelections) {rules.push({ type: "maxLength", value: config.maxSelections });}
            }
            break;
        }
    }

    return {
        rules,
        required: step.required
    };
}
