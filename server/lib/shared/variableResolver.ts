import crypto from "crypto";

import { getValueByPath } from "@shared/conditionEvaluator";

import { createLogger } from "../../logger";

const logger = createLogger({ module: "variable-resolver" });

/**
 * Resolve a single value expression to its actual value
 * Supports:
 * - {{variable}} syntax for explicit variable references
 * - Dot notation for nested paths (e.g., "step.field")
 * - Alias resolution via aliasMap
 * - Literal string values
 *
 * @param expression - The value expression to resolve (e.g., "{{email}}", "step.name", "literal text")
 * @param data - The context data object containing variable values
 * @param aliasMap - Optional mapping of aliases to step IDs
 * @returns The resolved value or null if resolution fails
 */
export function resolveSingleValue(
    expression: string | undefined | null,
    data: Record<string, any>,
    aliasMap?: Record<string, string>
): any {
    if (expression === undefined || expression === null) {return null;}
    if (typeof expression !== "string") {return expression;}

    const trimmed = expression.trim();
    if (!trimmed) {return null;}

    // Check if it looks like a variable expression {{...}}
    const isExpression = trimmed.startsWith("{{") && trimmed.endsWith("}}");
    const path = isExpression ? trimmed.slice(2, -2).trim() : trimmed;

    // Handle system variables
    if (path.startsWith("system:")) {
        switch (path) {
            case "system:autonumber":
                // Return undefined so it's excluded from the payload (letting DB default handle it)
                // Or if the column is not nullable/default, this might fail, but usually autonumber is SERIAL/IDENTITY
                return undefined;
            case "system:current_datetime":
                return new Date().toISOString(); // Return ISO string for datetime
            case "system:current_date":
                return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            case "system:current_time":
                return new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
            case "system:uuid":
                return crypto.randomUUID();
            default:
                // Unknown system var, treat as null or literal? 
                // Let's treat as null to be safe, or undefined?
                return null;
        }
    }

    // Try alias resolution if we have aliasMap
    let resolvedKey = path;
    let isAliased = false;
    if (aliasMap && path) {
        // Check if the first segment matches an alias
        const firstSegment = path.split('.')[0];
        const aliasId = aliasMap[firstSegment];

        if (aliasId) {
            // Determine if we have a match
            // We replace the first segment with the ID
            if (path === firstSegment) {
                resolvedKey = aliasId;
            } else {
                // Replace first segment: "alias.prop" -> "UUID.prop"
                resolvedKey = aliasId + path.substring(firstSegment.length);
            }
            isAliased = true;
        }
    }

    const val = getValueByPath(data, resolvedKey);
    // If val is defined, return it.
    if (val !== undefined) {return val;}

    // If strictly undefined, maybe it was a valid path that is empty?
    // Or maybe it is a static string?
    // For now, return the expression as is if resolution fails, assuming static?
    // Safer to defaults to null if it looked like a variable.

    // If it was explicitly aliased or wrapped in expression brackets, treat as null (empty variable)
    if (isAliased || isExpression) {return null;}

    // Otherwise, assume it's a static string literal
    return expression;
}

/**
 * Resolve multiple mappings to their actual values
 * @param mappings - Array of {key, value} pairs where value is an expression
 * @param data - The context data object
 * @param aliasMap - Optional mapping of aliases to step IDs
 * @returns Record of {key: resolvedValue}
 */
export function resolvePayloadMappings(
    mappings: Array<{ key: string; value: string }>,
    data: Record<string, any>,
    aliasMap?: Record<string, string>
): Record<string, any> {
    const result: Record<string, any> = {};

    for (const mapping of mappings) {
        const resolvedValue = resolveSingleValue(mapping.value, data, aliasMap);
        // Only include in result if value is not null/undefined
        if (resolvedValue !== undefined && resolvedValue !== null) {
            result[mapping.key] = resolvedValue;
        }
    }

    return result;
}

/**
 * Resolve column mappings for DataVault writes
 * @param mappings - Array of {columnId, value} pairs where value is an expression
 * @param data - The context data object
 * @param aliasMap - Optional mapping of aliases to step IDs
 * @returns Record of {columnId: resolvedValue}
 */
export function resolveColumnMappings(
    mappings: Array<{ columnId: string; value: string }>,
    data: Record<string, any>,
    aliasMap?: Record<string, string>
): Record<string, any> {
    const result: Record<string, any> = {};

    for (const mapping of mappings) {
        const resolvedValue = resolveSingleValue(mapping.value, data, aliasMap);
        // Only include if not undefined (allows system:autonumber to be skipped)
        if (resolvedValue !== undefined) {
            result[mapping.columnId] = resolvedValue;
        }
    }

    return result;
}
