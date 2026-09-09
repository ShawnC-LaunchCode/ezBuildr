/**
 * LU-6c — the AI logic-rule schema's trigger condition is `when` (the same
 * `ConditionExpression` shape `steps.visible_if`/`pages.visible_if`
 * use), not the legacy flat `conditionStepAlias`/`operator`/`conditionValue`
 * trio. These prove the schema itself enforces that: a well-formed `when`
 * parses, and a payload still shaped as the flat legacy DSL (no `when`) is
 * rejected rather than silently accepted with an unusable rule.
 */
import { describe, it, expect } from "vitest";

import { AIGeneratedLogicRuleSchema, AIGeneratedWorkflowSchema, AIWorkflowSuggestionSchema } from "../../../shared/types/ai";

import { AIPromptBuilder } from "../../../server/services/ai/AIPromptBuilder";

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
            {
              id: "step_1", type: "boolean", title: "Do you have pets?", alias: "hasPets", required: false,
              config: { trueLabel: "Yes", falseLabel: "No", displayStyle: "buttons" },
            },
            {
              id: "step_2", type: "text", title: "Pet name", alias: "petName", required: false,
              config: { variant: "short" },
            },
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
    };

    const result = AIGeneratedWorkflowSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pages).toHaveLength(1);
      expect(result.data).not.toHaveProperty("transformBlocks");
      expect(AIGeneratedWorkflowSchema.shape).not.toHaveProperty("transformBlocks");
      const prompt = new AIPromptBuilder().buildWorkflowGenerationPrompt({ description: "Create a pet intake workflow", projectId: "00000000-0000-4000-8000-000000000001" }, "easy");
      expect(prompt.systemMessage).not.toMatch(/transformBlocks|transform blocks/i);
      expect(prompt.systemMessage).toContain('"logicRules"');
      expect(result.data.logicRules).toHaveLength(1);
      expect(result.data.logicRules[0].when).not.toBeNull();
    }
  });
});

describe("AIWorkflowSuggestionSchema", () => {
  it("preserves AI Assist additions and modifications without a transform contract", () => {
    const payload = { newPages: [{ id: "page_2", title: "Details", order: 1, steps: [] }], newLogicRules: [], modifications: [{ type: "step", id: "step_1", changes: { title: "Your name" }, reason: "Clarify the question" }] };
    const result = AIWorkflowSuggestionSchema.parse(payload);
    expect(result).toEqual(payload);
    expect(result).not.toHaveProperty("newTransformBlocks");
    expect(AIWorkflowSuggestionSchema.shape).not.toHaveProperty("newTransformBlocks");
    expect(AIWorkflowSuggestionSchema.safeParse({ modifications: [{ ...payload.modifications[0], type: "transform_block" }] }).success).toBe(false);
    const prompt = new AIPromptBuilder().buildWorkflowSuggestionPrompt({ description: "Clarify the name question", workflowId: "00000000-0000-4000-8000-000000000001" }, { pages: [], logicRules: [] });
    expect(prompt.systemMessage).not.toMatch(/newTransformBlocks|transform_block/);
    expect(prompt.systemMessage).toContain('"newLogicRules"');
    expect(prompt.systemMessage).toContain('"modifications"');
  });
});
