
import { registerMigration, type WorkflowSchema } from "../registry";

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

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!newSchema.steps || !Array.isArray(newSchema.steps)) {
            return newSchema;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newSchema.steps = newSchema.steps.map((step: any) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const newStep = { ...step };
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
            const config = newStep.config ?? {};
            const legacyOptions = (step as Record<string, unknown>)["options"] ?? [];

            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            switch (step.type) {
                case "radio":
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    newStep.type = "choice";
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                    newStep.config = {
                        ...config,
                        widget: "radio",
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                        options: legacyOptions,
                        multiple: false
                    };
                    break;

                case "multiple_choice":
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    newStep.type = "choice";
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                    newStep.config = {
                        ...config,
                        widget: "checkbox",
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                        options: legacyOptions,
                        multiple: true
                    };
                    break;

                case "short_text":
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    newStep.type = "text";
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                    newStep.config = {
                        ...config,
                        inputType: "text",
                        multiline: false
                    };
                    break;

                case "long_text":
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    newStep.type = "text";
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                    newStep.config = {
                        ...config,
                        inputType: "text",
                        multiline: true
                    };
                    break;

                case "yes_no":
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    newStep.type = "boolean";
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                    newStep.config = {
                        ...config,
                        widget: "switch",
                        trueLabel: "Yes",
                        falseLabel: "No"
                    };
                    break;

                case "date_time":
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    newStep.type = "datetime_unified";
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
                    newStep.config = {
                        ...config,
                        includeDate: true,
                        includeTime: true
                    };
                    break;
            }

            // Cleanup legacy properties if they were moved to config
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if ((step as Record<string, unknown>)["options"]) {
                delete (newStep as Record<string, unknown>)["options"];
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return newStep;
        });

        return newSchema;
    }
});
