/**
 * LU-6c — the AI logic-rule schema's trigger condition is `when` (the same
 * `ConditionExpression` shape `steps.visible_if`/`pages.visible_if`
 * use), not the legacy flat `conditionStepAlias`/`operator`/`conditionValue`
 * trio. These prove the schema itself enforces that: a well-formed `when`
 * parses, and a payload still shaped as the flat legacy DSL (no `when`) is
 * rejected rather than silently accepted with an unusable rule.
 */
import { describe, it, expect } from "vitest";

import { AIGeneratedLogicRuleSchema, AIGeneratedWorkflowSchema } from "../../../shared/types/ai";

describe("AIGeneratedLogicRuleSchema", () => {
  const validWhen = {
    type: "group",
    id: "g1",
    operator: "AND",
    conditions: [
      { type: "condition", id: "c1", variable: "hasPets", operator: "is_true", valueType: "constant" },
    ],
  };

  it("accepts a rule whose trigger is a ConditionExpression `when`", () => {
    const result = AIGeneratedLogicRuleSchema.safeParse({
      id: "rule_1",
      when: validWhen,
      targetType: "step",
      targetAlias: "petName",
      action: "show",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.when).toEqual(validWhen);
    }
  });

  it("rejects a payload still shaped as the legacy flat condition (no `when`)", () => {
    const result = AIGeneratedLogicRuleSchema.safeParse({
      id: "rule_1",
      conditionStepAlias: "hasPets",
      operator: "equals",
      conditionValue: "yes",
      targetType: "step",
      targetAlias: "petName",
      action: "show",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a nested AND/OR tree, not just a single leaf condition", () => {
    const result = AIGeneratedLogicRuleSchema.safeParse({
      id: "rule_1",
      when: {
        type: "group",
        id: "g1",
        operator: "OR",
        conditions: [
          { type: "condition", id: "c1", variable: "hasPets", operator: "is_true", valueType: "constant" },
          {
            type: "group",
            id: "g2",
            operator: "AND",
            conditions: [
              { type: "condition", id: "c2", variable: "petCount", operator: "greater_than", value: 1, valueType: "constant" },
            ],
          },
        ],
      },
      targetType: "step",
      targetAlias: "petName",
      action: "show",
    });

    expect(result.success).toBe(true);
  });
});

describe("AIGeneratedWorkflowSchema", () => {
  it("round-trips a full workflow whose logic rule carries a working `when`", () => {
    const payload = {
      title: "Pet Intake",
      pages: [
        {
          id: "page_1",
          title: "Page 1",
          order: 0,
          steps: [
            { id: "step_1", type: "yes_no", title: "Do you have pets?", alias: "hasPets", required: false },
            { id: "step_2", type: "short_text", title: "Pet name", alias: "petName", required: false },
          ],
        },
      ],
      logicRules: [
        {
          id: "rule_1",
          when: {
            type: "group",
            id: "g1",
            operator: "AND",
            conditions: [
              { type: "condition", id: "c1", variable: "hasPets", operator: "is_true", valueType: "constant" },
            ],
          },
          targetType: "step",
          targetAlias: "petName",
          action: "show",
        },
      ],
      transformBlocks: [],
    };

    const result = AIGeneratedWorkflowSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.logicRules).toHaveLength(1);
      expect(result.data.logicRules[0].when).not.toBeNull();
    }
  });
});
