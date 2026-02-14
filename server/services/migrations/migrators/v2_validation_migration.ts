
import { ValidationRule } from "@shared/validation/ValidationRule";

import { registerMigration, WorkflowSchema } from "../registry";

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

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!newSchema.steps) { return newSchema; }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newSchema.steps = newSchema.steps.map((step: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const newStep = { ...step };
            // initialize validation container if it doesn't exist
            // The new structure expects step.config.validation = { rules: [] }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const config = newStep.config ?? {};
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            const rules: ValidationRule[] = config.validation?.rules ?? [];

            // Helper to add rule if not exists
            // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
            const addRule = (rule: ValidationRule) => {
                // Simple dedupe check
                if (!rules.find(r => r.type === rule.type)) {
                    rules.push(rule);
                }
            };

            // 1. Required (moved from top-level boolean to rule, optional but recommended for consistency)
            // We often keep top-level 'required' for UI convenience, but let's sync it.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (newStep.required) {
                addRule({ type: "required", message: "This field is required" });
            }

            // 2. Text Validations
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (config.minLength !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                addRule({ type: "minLength", value: config.minLength, message: `Minimum length is ${config.minLength}` });
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                delete config.minLength;
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (config.maxLength !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                addRule({ type: "maxLength", value: config.maxLength, message: `Maximum length is ${config.maxLength}` });
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                delete config.maxLength;
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (config.pattern !== undefined) {
                // Corrected: PatternRule uses 'regex', not 'value'
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                addRule({ type: "pattern", regex: config.pattern, message: "Invalid format" });
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                delete config.pattern;
            }

            // 3. Number Validations
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (config.min !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                addRule({ type: "minValue", value: config.min, message: `Minimum value is ${config.min}` });
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                delete config.min;
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (config.max !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                addRule({ type: "maxValue", value: config.max, message: `Maximum value is ${config.max}` });
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                delete config.max;
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            newStep.config = {
                ...config,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                validation: {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    ...config.validation,
                    rules
                }
            };

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return newStep;
        });

        return newSchema;
    }
});
