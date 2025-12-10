
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

        if (!newSchema.steps) return newSchema;

        newSchema.steps = newSchema.steps.map(step => {
            const newStep = { ...step };

            if (step.type === "js_question") {
                // Option A: Rename to 'script' if that's the new type
                // Option B: Keep 'js_question' but restructure config

                // Let's assume we are standardizing on 'script' or 'computation'
                // For now, let's keep type but ensure config has 'inputs' and 'code'

                const config = newStep.config || {};

                // Ensure "functionBody" (legacy) becomes "code"
                if (config.functionBody && !config.code) {
                    config.code = config.functionBody;
                    delete config.functionBody;
                }

                // Ensure language is set
                if (!config.language) {
                    config.language = "javascript";
                }

                newStep.config = config;
            }

            return newStep;
        });

        return newSchema;
    }
});
