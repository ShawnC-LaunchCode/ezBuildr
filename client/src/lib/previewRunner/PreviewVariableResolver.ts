import type { ApiStep } from '@/lib/vault-api';

/**
 * PreviewVariableResolver
 * 
 * Responsible for resolving the effective value of a variable (step)
 * based on the precedence rules:
 * 1. User-typed value (in current session)
 * 2. Snapshot value (if loaded)
 * 3. Auto-generated value (if auto-fill is on)
 * 4. Default value (from step config)
 */
export class PreviewVariableResolver {

    /**
     * Resolve values for all steps based on authoritative sources
     */
    static resolveInitialValues(
        steps: ApiStep[],
        snapshotValues: Record<string, any> = {},
        defaultValues: Record<string, any> = {}
    ): Record<string, any> {
        const resolved: Record<string, any> = {};

        // 1. Start with defaults
        steps.forEach(step => {
            // Use provided default or parse from step config
            // Note: step.defaultValue might be a JSON string or raw value
            if (step.defaultValue !== undefined && step.defaultValue !== null) {
                resolved[step.id] = this.parseValue(step.defaultValue);
            }
        });

        // 2. Override with snapshot values
        Object.assign(resolved, snapshotValues);

        // 3. User values (passed as initial override if any, though usually empty on init)
        // (Handled by caller merging if needed)

        return resolved;
    }

    /**
     * Parse a value that might be JSON stringified
     */
    private static parseValue(val: any): any {
        if (typeof val === 'string') {
            try {
                // Attempt to parse JSON (e.g., for address or multi-field)
                const parsed = JSON.parse(val);
                if (typeof parsed === 'object' && parsed !== null) return parsed;
            } catch (e) {
                // Not JSON, return as string
            }
        }
        return val;
    }
}
