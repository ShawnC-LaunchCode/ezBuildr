
import { registerMigration, WorkflowSchema } from "../registry";

/**
 * Migration: 1.2.0 -> 1.3.0
 * 
 * Migrates legacy 'js_question' blocks to the new 'script' block type or updates their config 
 * to match the new ScriptEngine requirements.
 */
registerMigration("1.2.0", {
    toVersion: "1.3.0",
    description: "Update JS blocks to new Scripting Engine format",
    migrate: async (schema: WorkflowSchema): Promise<WorkflowSchema> => {
        const newSchema = { ...schema };
        newSchema.version = "1.3.0";

        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (!newSchema.steps) { return newSchema; }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newSchema.steps = newSchema.steps.map((step: any) => {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Migration input uses legacy dynamic workflow data.
            const newStep = { ...step };

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Migration input uses legacy dynamic workflow data.
            if (step.type === "js_question") {
                // Option A: Rename to 'script' if that's the new type
                // Option B: Keep 'js_question' but restructure config

                // Let's assume we are standardizing on 'script' or 'computation'
                // For now, let's keep type but ensure config has 'inputs' and 'code'

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Migration input uses legacy dynamic workflow data.
                const config = newStep.config || {};

                // Ensure "functionBody" (legacy) becomes "code"
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Migration input uses legacy dynamic workflow data.
                if (config.functionBody && !config.code) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Migration input uses legacy dynamic workflow data.
                    config.code = config.functionBody;
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Migration input uses legacy dynamic workflow data.
                    delete config.functionBody;
                }

                // Ensure language is set
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Migration input uses legacy dynamic workflow data.
                if (!config.language) {
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Migration input uses legacy dynamic workflow data.
                    config.language = "javascript";
                }

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Migration input uses legacy dynamic workflow data.
                newStep.config = config;
            }

// eslint-disable-next-line @typescript-eslint/no-unsafe-return -- Migration input uses legacy dynamic workflow data.
            return newStep;
        });

        return newSchema;
    }
});
