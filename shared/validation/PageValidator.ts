import { evaluateConditionExpression } from "../conditionEvaluator";

import { formatMessage } from "./messages";
import { ValidationSchema, PageValidationResult } from "./ValidationSchema";
import { validateValue } from "./Validator";


import type { ValidateRule, ConditionalRequiredRule, CompareRule, ForEachRule, WhenCondition, ComparisonOperator } from "../types/blocks";
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
export async function validatePage({
    schemas,
    values,
    allValues,
    pageRules = [] // Added pageRules support
}: {
    schemas: Record<string, ValidationSchema>;
    values: Record<string, any>;
    allValues?: Record<string, any>;
    pageRules?: ValidateRule[];
}): Promise<PageValidationResult> {
    const blockErrors: Record<string, string[]> = {};
    let valid = true;

    const contextValues = allValues || values;

    // 1. Standard Field Validation
    for (const [blockId, schema] of Object.entries(schemas)) {
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
        const error = await validatePageRule(rule, contextValues);
        if (error) {
            // Error distribution logic
            if ('type' in rule && rule.type === 'conditional_required') {
                const cr = rule;
                const met = evaluateConditionExpression(whenToCondition(cr.when), contextValues);
                if (met) {
                    for (const fieldId of cr.requiredFields) {
                        const val = contextValues[fieldId];
                        if (val === null || val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) {
                            if (!blockErrors[fieldId]) {blockErrors[fieldId] = [];}
                            blockErrors[fieldId].push(cr.message || "This field is required");
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
            if (!blockErrors[target]) {blockErrors[target] = [];}
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
async function validatePageRule(rule: ValidateRule, values: Record<string, any>): Promise<string | null> {
    // Type guard / Check
    if (!('type' in rule)) {
        // Legacy rule
        return null;
    }

    switch (rule.type) {
        case 'compare': {
            const r = rule;
            const leftVal = getVal(r.left, values);
            const rightVal = r.rightType === 'variable' ? getVal(r.right, values) : r.right;

            if (!compare(leftVal, r.op, rightVal)) {
                return r.message || `Condition failed`;
            }
            return null;
        }
        case 'conditional_required':
            return null; // Handled in main loop

        case 'foreach': {
            const r = rule;
            const list = getVal(r.listKey, values);
            if (!Array.isArray(list)) {return null;}

            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                const itemContext = { ...values, [r.itemAlias]: item };

                for (const subRule of r.rules) {
                    // Check legacy inner rules
                    if (isLegacySubRule(subRule) && subRule.assert) {
                        const val = resolvePath(subRule.assert.key, itemContext);
                        if (!checkOp(val, subRule.assert.op, subRule.assert.value)) {
                            return `${subRule.message || "Invalid item"  } (Item ${i + 1})`;
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
    if (!when) {return null;}
    return {
        type: "group",
        id: `gen_${  Math.random().toString(36).substring(2)}`,
        operator: "AND",
        conditions: [{
            type: "condition",
            id: `gen_${  Math.random().toString(36).substring(2)}`,
            variable: when.key,
            operator: when.op,
            value: when.value,
            valueType: "constant"
        }]
    };
}

// Helpers
function getVal(key: string, values: Record<string, any>) {
    // support dot syntax?
    if (key.includes('.')) {return resolvePath(key, values);}
    return values[key];
}

function resolvePath(path: string, obj: any) {
    return path.split('.').reduce((prev, curr) => prev ? prev[curr] : undefined, obj);
}

function compare(left: any, op: string, right: any): boolean {
    switch (op) {
        case 'equals': return left == right;
        case 'not_equals': return left != right;
        case 'greater_than': return Number(left) > Number(right);
        case 'less_than': return Number(left) < Number(right);
        case 'contains': return String(left).includes(String(right));
        default: return false;
    }
}

function checkOp(val: any, op: string, compareVal?: any): boolean {
    switch (op) {
        case 'is_not_empty': return val !== null && val !== undefined && val !== "";
        case 'is_empty': return val === null || val === undefined || val === "";
        case 'equals': return val == compareVal;
        default: return true; // Loose default
    }
}
