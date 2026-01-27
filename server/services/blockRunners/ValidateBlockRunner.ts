/**
 * Validate Block Runner
 * Validates data against rules and returns error messages
 */
import { BaseBlockRunner } from "./BaseBlockRunner";

import type { BlockContext, BlockResult, Block, ValidateConfig } from "./types";
export class ValidateBlockRunner extends BaseBlockRunner {
  getBlockType(): string {
    return "validate";
  }
  async execute(config: ValidateConfig, context: BlockContext, block: Block): Promise<BlockResult> {
    const errors: string[] = [];
    const fieldErrors: Record<string, string[]> = {};
    const addFieldError = (field: string, msg: string) => {
      if (!fieldErrors[field]) {fieldErrors[field] = [];}
      fieldErrors[field].push(msg);
    };
    for (const rule of config.rules) {
      // Determine rule type (fallback to legacy/simple if no type property)
      const ruleType = (rule as any).type || "simple";
      if (ruleType === "compare") {
        this.handleCompareRule(rule as any, context, errors, addFieldError);
      } else if (ruleType === "conditional_required") {
        this.handleConditionalRequiredRule(rule as any, context, errors, addFieldError);
      } else if (ruleType === "foreach") {
        this.handleForEachRule(rule as any, context, errors, addFieldError);
      } else {
        // Legacy / Simple Rule
        this.handleSimpleRule(rule as any, context, errors, addFieldError);
      }
    }
    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    };
  }
  /**
   * Handle compare rule
   */
  private handleCompareRule(
    rule: any,
    context: BlockContext,
    errors: string[],
    addFieldError: (field: string, msg: string) => void
  ): void {
    const leftValue = this.getValueByPath(context.data, rule.left);
    let rightValue;
    if (rule.rightType === "constant") {
      rightValue = rule.right;
    } else {
      rightValue = this.getValueByPath(context.data, rule.right);
    }
    const passed = this.compareValues(leftValue, rule.op, rightValue);
    if (!passed) {
      errors.push(rule.message);
      // Attribute error to left operand field if possible
      if (rule.left) {
        const stepId = context.aliasMap?.[rule.left] || rule.left;
        addFieldError(stepId, rule.message);
      }
    }
  }
  /**
   * Handle conditional required rule
   */
  private handleConditionalRequiredRule(
    rule: any,
    context: BlockContext,
    errors: string[],
    addFieldError: (field: string, msg: string) => void
  ): void {
    const conditionMet = this.evaluateCondition(rule.when, context.data);
    if (conditionMet) {
      for (const field of rule.requiredFields) {
        const stepId = context.aliasMap?.[field] || field;
        const value = context.data[stepId];
        if (this.isEmpty(value)) {
          errors.push(rule.message);
          addFieldError(stepId, rule.message);
        }
      }
    }
  }
  /**
   * Handle for-each rule
   */
  private handleForEachRule(
    rule: any,
    context: BlockContext,
    errors: string[],
    addFieldError: (field: string, msg: string) => void
  ): void {
    const list = this.getValueByPath(context.data, rule.listKey);
    if (Array.isArray(list)) {
      list.forEach((item, index) => {
        // Create a scoped data context for the item
        const scopedData = { ...context.data };
        scopedData[rule.itemAlias] = item;
        for (const subRule of rule.rules) {
          // Logic for simple assertions
          if ((subRule).assert) {
            const sRule = subRule;
            const val = this.getValueByPath(scopedData, sRule.assert.key);
            const passed = this.evaluateAssertion({ ...sRule.assert, key: "temp" }, { temp: val });
            if (!passed) {
              errors.push(rule.message || sRule.message);
              const listStepId = context.aliasMap?.[rule.listKey] || rule.listKey;
              addFieldError(listStepId, rule.message || sRule.message);
            }
          }
        }
      });
    }
  }
  /**
   * Handle simple/legacy rule
   */
  private handleSimpleRule(
    rule: any,
    context: BlockContext,
    errors: string[],
    addFieldError: (field: string, msg: string) => void
  ): void {
    // Check when condition (if present)
    if (rule.when) {
      const conditionMet = this.evaluateCondition(rule.when, context.data);
      if (!conditionMet) {
        return; // Skip this rule if condition not met
      }
    }
    // Evaluate assertion
    const assertionPassed = this.evaluateAssertion(rule.assert, context.data);
    if (!assertionPassed) {
      errors.push(rule.message);
      // Attribute to key
      if (rule.assert?.key) {
        const stepId = context.aliasMap?.[rule.assert.key] || rule.assert.key;
        addFieldError(stepId, rule.message);
      }
    }
  }
}