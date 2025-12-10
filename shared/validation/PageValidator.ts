import { validateValue } from "./Validator";
import { ValidationSchema, PageValidationResult } from "./ValidationSchema";

/**
 * Validates a map of block values against their schemas.
 */
export async function validatePage({
    schemas,
    values,
    allValues, // Complete dataset for conditional logic
}: {
    schemas: Record<string, ValidationSchema>;
    values: Record<string, any>; // Values relative to this page/context
    allValues?: Record<string, any>; // Global context if different
}): Promise<PageValidationResult> {
    const blockErrors: Record<string, string[]> = {};
    let valid = true;

    const contextValues = allValues || values;

    for (const [blockId, schema] of Object.entries(schemas)) {
        // Determine the value for this block
        // Handling nested keys if necessary, but typically values is flat map of blockId -> value
        const value = values[blockId];

        const result = await validateValue({
            schema,
            value,
            values: contextValues,
        });

        if (!result.valid) {
            blockErrors[blockId] = result.errors;
            valid = false;
        }
    }

    return {
        valid,
        blockErrors,
    };
}
