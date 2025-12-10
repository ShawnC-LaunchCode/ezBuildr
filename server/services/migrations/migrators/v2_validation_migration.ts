
import { registerMigration, WorkflowSchema } from "../registry";
import { ValidationRule } from "@shared/validation/ValidationRule";

/**
 * Migration: 1.1.0 -> 1.2.0
 * 
 * Migrates legacy validation properties (minLength, maxLength, etc.) 
 * to the new 'validation' object structure with explicit rules.
 */
registerMigration("1.1.0", {
    toVersion: "1.2.0",
    description: "Migrate legacy validation props to new Validation Engine rules",
    migrate: async (schema: WorkflowSchema): Promise<WorkflowSchema> => {
        const newSchema = { ...schema };
        newSchema.version = "1.2.0";

        if (!newSchema.steps) return newSchema;

        newSchema.steps = newSchema.steps.map(step => {
            const newStep = { ...step };
            // initialize validation container if it doesn't exist
            // The new structure expects step.config.validation = { rules: [] }
            const config = newStep.config || {};
            const rules: ValidationRule[] = config.validation?.rules || [];

            // Helper to add rule if not exists
            const addRule = (rule: ValidationRule) => {
                // Simple dedupe check
                if (!rules.find(r => r.type === rule.type)) {
                    rules.push(rule);
                }
            };

            // 1. Required (moved from top-level boolean to rule, optional but recommended for consistency)
            // We often keep top-level 'required' for UI convenience, but let's sync it.
            if (newStep.required) {
                addRule({ type: "required", message: "This field is required" });
            }

            // 2. Text Validations
            if (config.minLength !== undefined) {
                addRule({ type: "minLength", value: config.minLength, message: `Minimum length is ${config.minLength}` });
                delete config.minLength;
            }
            if (config.maxLength !== undefined) {
                addRule({ type: "maxLength", value: config.maxLength, message: `Maximum length is ${config.maxLength}` });
                delete config.maxLength;
            }
            if (config.pattern !== undefined) {
                // Corrected: PatternRule uses 'regex', not 'value'
                addRule({ type: "pattern", regex: config.pattern, message: "Invalid format" });
                delete config.pattern;
            }

            // 3. Number Validations
            if (config.min !== undefined) {
                addRule({ type: "minValue", value: config.min, message: `Minimum value is ${config.min}` });
                delete config.min;
            }
            if (config.max !== undefined) {
                addRule({ type: "maxValue", value: config.max, message: `Maximum value is ${config.max}` });
                delete config.max;
            }

            newStep.config = {
                ...config,
                validation: {
                    ...config.validation,
                    rules
                }
            };

            return newStep;
        });

        return newSchema;
    }
});
