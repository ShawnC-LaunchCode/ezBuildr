
import { registerMigration, WorkflowSchema } from "../registry";

/**
 * Migration: 1.0.0 -> 1.1.0
 * 
 * Refactors legacy block types to new unified types:
 * - radio, multiple_choice -> choice
 * - short_text, long_text -> text
 * - yes_no -> boolean
 * - date_time -> datetime_unified
 */
registerMigration("1.0.0", {
    toVersion: "1.1.0",
    description: "Refactor legacy block types to new unified system",
    migrate: async (schema: WorkflowSchema): Promise<WorkflowSchema> => {
        const newSchema = { ...schema };

        // Ensure version is updated
        newSchema.version = "1.1.0";

        if (!newSchema.steps || !Array.isArray(newSchema.steps)) {
            return newSchema;
        }

        newSchema.steps = newSchema.steps.map(step => {
            const newStep = { ...step };
            const config = newStep.config || {};

            switch (step.type) {
                case "radio":
                    newStep.type = "choice";
                    newStep.config = {
                        ...config,
                        widget: "radio",
                        options: step.options || [],
                        multiple: false
                    };
                    break;

                case "multiple_choice":
                    newStep.type = "choice";
                    newStep.config = {
                        ...config,
                        widget: "checkbox",
                        options: step.options || [],
                        multiple: true
                    };
                    break;

                case "short_text":
                    newStep.type = "text";
                    newStep.config = {
                        ...config,
                        inputType: "text",
                        multiline: false
                    };
                    break;

                case "long_text":
                    newStep.type = "text";
                    newStep.config = {
                        ...config,
                        inputType: "text",
                        multiline: true
                    };
                    break;

                case "yes_no":
                    newStep.type = "boolean";
                    newStep.config = {
                        ...config,
                        widget: "switch", // Default to switch for yes/no 
                        trueLabel: "Yes",
                        falseLabel: "No"
                    };
                    break;

                case "date_time":
                    newStep.type = "datetime_unified";
                    newStep.config = {
                        ...config,
                        includeDate: true,
                        includeTime: true
                    };
                    break;
            }

            // Cleanup legacy properties if they were moved to config
            if (step.options) {delete newStep.options;}

            return newStep;
        });

        return newSchema;
    }
});
