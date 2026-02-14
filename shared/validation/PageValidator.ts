import { evaluateConditionExpression } from "../conditionEvaluator";

import { ValidationSchema, PageValidationResult } from "./ValidationSchema";
import { validateValue } from "./Validator";

import type { ValidateRule, WhenCondition } from "../types/blocks";
import type { ConditionExpression } from "../types/conditions"; // Import ConditionExpression types
/**
 * Type guards for ValidateRule types
 */
interface RuleWithLeft {
    left: string;
}
interface RuleWithListKey {
    listKey: string;
}
interface LegacySubRule {
    assert?: {
        key: string;
        op: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy validation value can be any type
        value: any;
    };
    message?: string;
}
function hasLeftProperty(rule: unknown): rule is RuleWithLeft {
    return typeof rule === 'object' && rule !== null && 'left' in rule;
}
function hasListKeyProperty(rule: unknown): rule is RuleWithListKey {
    return typeof rule === 'object' && rule !== null && 'listKey' in rule;
}
function isLegacySubRule(rule: unknown): rule is LegacySubRule {
    return typeof rule === 'object' && rule !== null && !('type' in rule);
}
/**
 * Validates a map of block values against their schemas.
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- complex validation logic needs to check many conditions
export async function validatePage({
    schemas,
    values,
    allValues,
    pageRules = [] // Added pageRules support
}: {
    schemas: Record<string, ValidationSchema>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- values can contain any user input types
    values: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- values can contain any user input types
    allValues?: Record<string, any>;
    pageRules?: ValidateRule[];
}): Promise<PageValidationResult> {
    const blockErrors: Record<string, string[]> = {};
    let valid = true;
    const contextValues = allValues ?? values;
    // 1. Standard Field Validation
    for (const [blockId, schema] of Object.entries(schemas)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- values are dynamic user input
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
    // 2. Page-Level Rules Validation
    for (const rule of pageRules) {
        // eslint-disable-next-line @typescript-eslint/await-thenable
        const error = await validatePageRule(rule, contextValues);
        if (error !== null && error !== undefined) {
            // Error distribution logic
            if ('type' in rule && rule.type === 'conditional_required') {
                const cr = rule;
                const met = evaluateConditionExpression(whenToCondition(cr.when), contextValues);
                if (met) {
                    // eslint-disable-next-line max-depth -- validation logic requires nested conditions
                    for (const fieldId of cr.requiredFields) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, max-depth -- contextValues contains dynamic data
                        const val = contextValues[fieldId];
                        // eslint-disable-next-line max-depth -- validation logic requires deep nesting
                        if (val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) {
                            // eslint-disable-next-line max-depth -- validation logic requires deep nesting
                            if (!(blockErrors[fieldId] !== null && blockErrors[fieldId] !== undefined)) { blockErrors[fieldId] = []; }
                            blockErrors[fieldId].push(cr.message ?? "This field is required");
                            valid = false;
                        }
                    }
                }
                continue;
            }
            // Generic fallback - determine which field to attach error to
            let target = "_general";
            if (hasLeftProperty(rule)) {
                target = rule.left;
            } else if (hasListKeyProperty(rule)) {
                target = rule.listKey;
            }
            if (!(blockErrors[target] !== null && blockErrors[target] !== undefined)) { blockErrors[target] = []; }
            blockErrors[target].push(error);
            valid = false;
        }
    }
    return {
        valid,
        blockErrors,
    };
}
// Logic implementations
// eslint-disable-next-line sonarjs/cognitive-complexity -- complex rule validation logic
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- values can contain any user input types
function validatePageRule(rule: ValidateRule, values: Record<string, any>): string | null {
    // Type guard / Check
    if (!('type' in rule)) {
        // Legacy rule
        return null;
    }
    switch (rule.type) {
        case 'compare': {
            const r = rule;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic validation values
            const leftVal = getVal(r.left, values);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- dynamic validation values
            const rightVal = r.rightType === 'variable' ? getVal(r.right, values) : r.right;
            if (!compare(leftVal, r.op, rightVal)) {
                return r.message ?? `Condition failed`;
            }
            return null;
        }
        case 'conditional_required':
            return null; // Handled in main loop
        case 'foreach': {
            const r = rule;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic validation values
            const list = getVal(r.listKey, values);
            if (!Array.isArray(list)) { return null; }
            for (let i = 0; i < list.length; i++) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic list items
                const item = list[i];
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const itemContext = { ...values, [r.itemAlias]: item };
                // eslint-disable-next-line max-depth -- validation logic requires nested conditions
                for (const subRule of r.rules) {
                    // Check legacy inner rules
                    // eslint-disable-next-line max-depth -- validation logic requires nested conditions
                    if (isLegacySubRule(subRule) && subRule.assert) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic validation values
                        const val = resolvePath(subRule.assert.key, itemContext);
                        if (!checkOp(val, subRule.assert.op, subRule.assert.value)) {
                            return `${subRule.message ?? "Invalid item"} (Item ${i + 1})`;
                        }
                    }
                }
            }
            return null;
        }
        default:
            return null;
    }
}
function whenToCondition(when: WhenCondition): ConditionExpression {
    if (!(when !== null && when !== undefined)) { return null; }
    return {
        type: "group",
        id: `gen_${Math.random().toString(36).substring(2)}`,
        operator: "AND",
        conditions: [{
            type: "condition",
            id: `gen_${Math.random().toString(36).substring(2)}`,
            variable: when.key,
            operator: when.op,
            value: when.value,
            valueType: "constant"
        }]
    };
}
// Helpers
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- values can contain any user input types
function getVal(key: string, values: Record<string, any>): unknown {
    // support dot syntax?
    if (key.includes('.')) { return resolvePath(key, values); }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- dynamic value access
    return values[key];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- obj can be any nested structure
function resolvePath(path: string, obj: any): unknown {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access -- dynamic path resolution
    return path.split('.').reduce((prev, curr) => (prev !== null && prev !== undefined) ? prev[curr] : undefined, obj);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- comparison values can be any type
function compare(left: any, op: string, right: any): boolean {
    switch (op) {
        case 'equals': return left === right;
        case 'not_equals': return left !== right;
        case 'greater_than': return Number(left) > Number(right);
        case 'less_than': return Number(left) < Number(right);
        case 'contains': return String(left).includes(String(right));
        default: return false;
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- comparison values can be any type
function checkOp(val: any, op: string, compareVal?: any): boolean {
    switch (op) {
        case 'is_not_empty': return val !== null && val !== undefined && val !== "";
        case 'is_empty': return val === null || val === undefined || val === "";
        case 'equals': return val === compareVal;
        default: return true; // Loose default
    }
}