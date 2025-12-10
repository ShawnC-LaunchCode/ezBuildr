import type { ConditionExpression } from "../types/conditions";

export type ValidationRuleType =
    | "required"
    | "minLength"
    | "maxLength"
    | "minValue"
    | "maxValue"
    | "pattern"
    | "email"
    | "url"
    | "custom"      // Custom sync JS function (legacy/simple)
    | "conditional" // DSL or simple conditional
    | "script";     // Full custom script execution

export interface ValidationRuleBase {
    type: ValidationRuleType;
    message?: string;
    id?: string; // Optional ID for the rule
}

export interface RequiredRule extends ValidationRuleBase {
    type: "required";
}

export interface MinLengthRule extends ValidationRuleBase {
    type: "minLength";
    value: number;
}

export interface MaxLengthRule extends ValidationRuleBase {
    type: "maxLength";
    value: number;
}

export interface MinValueRule extends ValidationRuleBase {
    type: "minValue";
    value: number;
}

export interface MaxValueRule extends ValidationRuleBase {
    type: "maxValue";
    value: number;
}

export interface PatternRule extends ValidationRuleBase {
    type: "pattern";
    regex: string;
}

export interface EmailRule extends ValidationRuleBase {
    type: "email";
}

export interface UrlRule extends ValidationRuleBase {
    type: "url";
}

export interface ConditionalRule extends ValidationRuleBase {
    type: "conditional";
    expression?: string; // "age > 18" (Legacy or DSL string)
    condition?: ConditionExpression; // Structured condition object
}

export interface ScriptRule extends ValidationRuleBase {
    type: "script";
    hookId: string; // ID of the script hook
}

export type ValidationRule =
    | RequiredRule
    | MinLengthRule
    | MaxLengthRule
    | MinValueRule
    | MaxValueRule
    | PatternRule
    | EmailRule
    | UrlRule
    | ConditionalRule
    | ScriptRule;
