import { describe, it, expect } from "vitest";

import type { LogicRule } from "@shared/schema";
import type { ConditionExpression, ComparisonOperator } from "@shared/types/conditions";
import {
  evaluateRules,
  calculateNextSection,
  resolveNextSection,
  validateRequiredSteps,
  getEffectiveRequiredSteps,
  evaluateWorkflowVisibility,
  buildSingleConditionExpression,
} from "@shared/workflowLogic";

/**
 * Shorthand for building a single-condition `when` in these fixtures - a
 * thin alias over the same `buildSingleConditionExpression` production code
 * uses (LU-6a), so every rule below exercises the real evaluator through the
 * real production shape rather than a test-only shortcut.
 */
function cond(variable: string, operator: string, value?: unknown): ConditionExpression {
  return buildSingleConditionExpression(variable, operator as ComparisonOperator, value);
}

describe("evaluateWorkflowVisibility parity contract", () => {
  const sections = [
    { id: "intro" },
    {
      id: "details",
      visibleIf: {
        type: "group",
        operator: "AND",
        conditions: [{
          type: "condition",
          variable: "controller",
          operator: "equals",
          value: "yes",
          valueType: "constant",
        }],
      },
    },
  ];
  const steps = [
    { id: "controller", sectionId: "intro", required: true },
    { id: "detail", sectionId: "details", required: true },
  ];

  it("fails closed for section visibleIf and excludes its required steps", () => {
    const result = evaluateWorkflowVisibility({
      sections,
      steps,
      rules: [],
      data: {},
      resolveAlias: (name) => name,
    });

    expect(Array.from(result.visibleSections)).toEqual(["intro"]);
    expect(Array.from(result.visibleSteps)).toEqual(["controller"]);
    expect(Array.from(result.requiredSteps)).toEqual(["controller"]);
  });

  it("keeps show-rule targets hidden until the rule matches", () => {
    const rules: LogicRule[] = [{
      id: "show-details",
      workflowId: "workflow-1",
      conditionStepId: "controller",
      when: cond("controller", "equals", "yes"),
      targetType: "section",
      targetSectionId: "details",
      targetStepId: null,
      action: "show",
      order: 1,
      createdAt: null,
      updatedAt: null,
    }];

    const hidden = evaluateWorkflowVisibility({ sections, steps, rules, data: {}, resolveAlias: (name) => name });
    const shown = evaluateWorkflowVisibility({
      sections,
      steps,
      rules,
      data: { controller: "yes" },
      resolveAlias: (name) => name,
    });

    expect(hidden.visibleSections.has("details")).toBe(false);
    expect(shown.visibleSections.has("details")).toBe(true);
  });
});
describe("evaluateWorkflowVisibility classifies runner-requirable step types", () => {
  // requiredSteps is the one place navigation, section-submit validation, and
  // run completion all derive "what must have a value" from. A required step
  // of a type the runner cannot render (or
  // an unrecognized type) can never be satisfied by a respondent, so it must
  // never end up in requiredSteps here - fixing it in this one function fixes
  // all three call sites at once.
  const sections = [{ id: "sec-1" }];

  it("includes a required file_upload step now that the runner supports it", () => {
    const steps = [
      { id: "upload-step", sectionId: "sec-1", required: true, type: "file_upload" },
    ];

    const result = evaluateWorkflowVisibility({
      sections,
      steps,
      rules: [],
      data: {},
      resolveAlias: (name) => name,
    });

    expect(result.visibleSteps.has("upload-step")).toBe(true);
    expect(result.requiredSteps.has("upload-step")).toBe(true);
  });

  it("still includes a required short_text step in requiredSteps (unchanged behavior)", () => {
    const steps = [
      { id: "text-step", sectionId: "sec-1", required: true, type: "short_text" },
    ];

    const result = evaluateWorkflowVisibility({
      sections,
      steps,
      rules: [],
      data: {},
      resolveAlias: (name) => name,
    });

    expect(result.requiredSteps.has("text-step")).toBe(true);
  });

  it("includes a file upload made required by a rule", () => {
    const steps = [
      { id: "trigger", sectionId: "sec-1", required: false, type: "short_text" },
      { id: "upload-step", sectionId: "sec-1", required: false, type: "file_upload" },
    ];
    const rules: LogicRule[] = [{
      id: "require-upload",
      workflowId: "workflow-1",
      conditionStepId: "trigger",
      when: cond("trigger", "equals", "yes"),
      targetType: "step",
      targetStepId: "upload-step",
      targetSectionId: null,
      action: "require",
      order: 1,
      createdAt: null,
      updatedAt: null,
    }];

    const result = evaluateWorkflowVisibility({
      sections,
      steps,
      rules,
      data: { trigger: "yes" },
      resolveAlias: (name) => name,
    });

    expect(result.requiredSteps.has("upload-step")).toBe(true);
  });

  it("treats a step definition with no type as requirable (fail-open on missing classification, not silently dropped)", () => {
    const steps = [
      { id: "legacy-step", sectionId: "sec-1", required: true },
    ];

    const result = evaluateWorkflowVisibility({
      sections,
      steps,
      rules: [],
      data: {},
      resolveAlias: (name) => name,
    });

    expect(result.requiredSteps.has("legacy-step")).toBe(true);
  });
});
describe("workflowLogic", () => {
  describe("evaluateRules", () => {
    describe("Section-level rules", () => {
      it("should show section when condition is met", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "section",
            targetSectionId: "sec-1", targetStepId: null,
            conditionStepId: "step-1",
            when: cond("step-1", "equals", "yes"),
            action: "show",
            order: 1, createdAt: null, updatedAt: null,
          },
        ];
        const data = { "step-1": "yes" };
        const result = evaluateRules(rules, data);
        expect(result.visibleSections.has("sec-1")).toBe(true);
      });
      it("should hide section when hide action is triggered", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "section",
            targetSectionId: "sec-1", targetStepId: null,
            conditionStepId: "step-1",
            when: cond("step-1", "equals", "no"),
            action: "hide",
            order: 1, createdAt: null, updatedAt: null,
          },
        ];
        // First, add the section to visible set
        const data = { "step-1": "no" };
        const result = evaluateRules(rules, data);
        // Should not be in visible sections (delete doesn't error if not present)
        expect(result.visibleSections.has("sec-1")).toBe(false);
        expect(result.hiddenSections.has("sec-1")).toBe(true);
      });
      it("should set skip target when skip_to action is triggered", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "section",
            targetSectionId: "sec-3", targetStepId: null,
            conditionStepId: "step-1",
            when: cond("step-1", "equals", "skip"),
            action: "skip_to",
            order: 1, createdAt: null, updatedAt: null,
          },
        ];
        const data = { "step-1": "skip" };
        const result = evaluateRules(rules, data);
        expect(result.skipToSectionId).toBe("sec-3");
      });
      it("should deterministically keep the lower-order rule when two skip_to rules both fire", () => {
        // RUN2-2: multiple firing skip_to rules must not "last one wins" by
        // incoming array order - the lowest rule.order wins, deterministically,
        // regardless of the order the rules are passed in.
        const higherOrderRule: LogicRule = {
          id: "rule-high-order",
          workflowId: "wf-1",
          targetType: "section",
          targetSectionId: "sec-4", targetStepId: null,
          conditionStepId: "step-1",
          when: cond("step-1", "equals", "skip"),
          action: "skip_to",
          order: 5, createdAt: null, updatedAt: null,
        };
        const lowerOrderRule: LogicRule = {
          id: "rule-low-order",
          workflowId: "wf-1",
          targetType: "section",
          targetSectionId: "sec-2", targetStepId: null,
          conditionStepId: "step-1",
          when: cond("step-1", "equals", "skip"),
          action: "skip_to",
          order: 2, createdAt: null, updatedAt: null,
        };
        const data = { "step-1": "skip" };

        // Passed in ascending order already.
        const ascending = evaluateRules([lowerOrderRule, higherOrderRule], data);
        expect(ascending.skipToSectionId).toBe("sec-2");

        // Passed in reverse (descending) array order - result must be identical.
        const descending = evaluateRules([higherOrderRule, lowerOrderRule], data);
        expect(descending.skipToSectionId).toBe("sec-2");
      });
      it("should ignore rule with missing targetSectionId", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "section",
            targetSectionId: null as unknown as string,
            targetStepId: null,
            conditionStepId: "step-1",
            when: cond("step-1", "equals", "yes"),
            action: "show",
            order: 1, createdAt: null, updatedAt: null,
          },
        ];
        const data = { "step-1": "yes" };
        const result = evaluateRules(rules, data);
        expect(result.visibleSections.size).toBe(0);
      });
    });
    describe("Step-level rules", () => {
      it("should show step when condition is met", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "step",
            targetStepId: "step-2", targetSectionId: null,
            conditionStepId: "step-1",
            when: cond("step-1", "equals", "yes"),
            action: "show",
            order: 1, createdAt: null, updatedAt: null,
          },
        ];
        const data = { "step-1": "yes" };
        const result = evaluateRules(rules, data);
        expect(result.visibleSteps.has("step-2")).toBe(true);
      });
      it("should hide step and remove from required when hide action is triggered", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "step",
            targetStepId: "step-2", targetSectionId: null,
            conditionStepId: "step-1",
            when: cond("step-1", "equals", "no"),
            action: "hide",
            order: 1, createdAt: null, updatedAt: null,
          },
        ];
        const data = { "step-1": "no" };
        const result = evaluateRules(rules, data);
        expect(result.visibleSteps.has("step-2")).toBe(false);
        expect(result.hiddenSteps.has("step-2")).toBe(true);
        expect(result.requiredSteps.has("step-2")).toBe(false);
      });
      it("should require step when require action is triggered", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "step",
            targetStepId: "step-2", targetSectionId: null,
            conditionStepId: "step-1",
            when: cond("step-1", "equals", "yes"),
            action: "require",
            order: 1, createdAt: null, updatedAt: null,
          },
        ];
        const data = { "step-1": "yes" };
        const result = evaluateRules(rules, data);
        expect(result.requiredSteps.has("step-2")).toBe(true);
      });
      it("should make step optional when make_optional action is triggered", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "step",
            targetStepId: "step-2", targetSectionId: null,
            conditionStepId: "step-1",
            when: cond("step-1", "equals", "yes"),
            action: "make_optional",
            order: 1, createdAt: null, updatedAt: null,
          },
        ];
        const data = { "step-1": "yes" };
        const result = evaluateRules(rules, data);
        expect(result.requiredSteps.has("step-2")).toBe(false);
      });
      it("should ignore rule with missing targetStepId", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "step",
            targetStepId: null as unknown as string,
            targetSectionId: null,
            conditionStepId: "step-1",
            when: cond("step-1", "equals", "yes"),
            action: "show",
            order: 1, createdAt: null, updatedAt: null,
          },
        ];
        const data = { "step-1": "yes" };
        const result = evaluateRules(rules, data);
        expect(result.visibleSteps.size).toBe(0);
      });
    });
    describe("Operators", () => {
      describe("equals", () => {
        it("should handle string equality (case-insensitive)", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "equals", "YES"),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": "yes" };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should handle boolean equality", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "equals", true),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": "true" };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should handle array equality (same order)", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "equals", ["a", "b"]),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": ["a", "b"] };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        // Deliberate behavior change vs. the pre-LU-6a flat evaluator's own
        // `isEqual`, which sorted copies before comparing (order-independent
        // array equality). `conditionEvaluator`'s `isEqual` - the ONE
        // evaluator every action now shares - compares arrays index-by-index
        // (order-sensitive), matching how `visibleIf` has always behaved.
        // Decision #5 adopts Model A's semantics as canonical; there are 0
        // production `logic_rules` rows today, so nothing observes this
        // change.
        it("treats differently-ordered arrays as not equal (order-sensitive, unlike the pre-LU-6a evaluator)", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "equals", ["b", "a"]),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": ["a", "b"] };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(false);
        });
        it("should handle numeric equality", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "equals", 42),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": 42 };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("does not mutate the data map's array value or the rule's when.value when comparing arrays (RUN2-5)", () => {
          const conditionValue = ["c", "a", "b"];
          const actualAnswer = ["z", "x", "y"];
          const conditionValueClone = [...conditionValue];
          const actualAnswerClone = [...actualAnswer];
          const when = cond("step-1", "equals", conditionValue);
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when,
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": actualAnswer };

          evaluateRules(rules, data);

          const leafValue = (when as { conditions: Array<{ value: unknown }> }).conditions[0].value;

          // Byte-identical to the pre-evaluation clones (acceptance criterion 1/4).
          expect(data["step-1"]).toEqual(actualAnswerClone);
          expect(leafValue).toEqual(conditionValueClone);
          // Same object references, not merely equal-but-replaced arrays.
          expect(data["step-1"]).toBe(actualAnswer);
          expect(leafValue).toBe(conditionValue);
        });
      });
      describe("not_equals", () => {
        it("should return true when values are different", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "not_equals", "no"),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": "yes" };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
      });
      describe("contains", () => {
        it("should match substring in string (case-insensitive)", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "contains", "WORLD"),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": "Hello World" };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should match item in array", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "contains", "apple"),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": ["apple", "banana", "orange"] };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should return false for non-string, non-array values", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "contains", "test"),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": 42 };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(false);
        });
      });
      describe("not_contains", () => {
        it("should return true when substring is not found", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "not_contains", "xyz"),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": "Hello World" };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
      });
      describe("greater_than", () => {
        it("should compare numeric values", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "greater_than", 10),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": 20 };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should parse string numbers", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "greater_than", "10"),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": "20" };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should return false for invalid numbers", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "greater_than", 10),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": "not a number" };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(false);
        });
      });
      describe("less_than", () => {
        it("should compare numeric values", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "less_than", 30),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": 20 };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
      });
      describe("between", () => {
        it("should check if value is between min and max (inclusive)", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "between", { min: 10, max: 20 }),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": 15 };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should include boundary values", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "between", { min: 10, max: 20 }),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data1 = { "step-1": 10 };
          const result1 = evaluateRules(rules, data1);
          expect(result1.visibleSteps.has("step-2")).toBe(true);
          const data2 = { "step-1": 20 };
          const result2 = evaluateRules(rules, data2);
          expect(result2.visibleSteps.has("step-2")).toBe(true);
        });
        it("should return false if value is outside range", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "between", { min: 10, max: 20 }),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": 25 };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(false);
        });
        it("should return false for invalid range format", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "between", "invalid"),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": 15 };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(false);
        });
        it("should return false for non-numeric value", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "between", { min: 10, max: 20 }),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": "not a number" };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(false);
        });
      });
      describe("is_empty", () => {
        it("should return true for null", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "is_empty", null),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": null };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should return true for undefined", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "is_empty", null),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": undefined };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should return true for empty string", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "is_empty", null),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": "   " };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should return true for empty array", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "is_empty", null),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": [] };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should return true for empty object", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "is_empty", null),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": {} };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should return false for non-empty values", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "is_empty", null),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": "test" };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(false);
        });
      });
      describe("is_not_empty", () => {
        it("should return true for non-empty string", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "is_not_empty", null),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": "test" };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(true);
        });
        it("should return false for null", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "is_not_empty", null),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": null };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(false);
        });
      });
      describe("Unresolvable condition step (RUN2-11)", () => {
        // [probe-confirmed] A rule reaching the engine with an empty
        // conditionStepId (e.g. RunRuntimeService's old `?? ""` fallback for
        // an alias that no longer resolves) must have NO effect, for every
        // operator - not just degrade to "always fires" for is_empty.
        it("does not fire is_empty for an empty conditionStepId, even though data[''] is undefined", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "section",
              targetSectionId: "B", targetStepId: null,
              conditionStepId: "",
              when: cond("", "is_empty", null),
              action: "hide",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { q1: "anything" };
          const result = evaluateRules(rules, data);
          expect(result.hiddenSections.has("B")).toBe(false);
        });
        it("does not fire is_not_empty for an empty conditionStepId", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "",
              when: cond("", "is_not_empty", null),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const result = evaluateRules(rules, { "step-2": "irrelevant" });
          expect(result.visibleSteps.has("step-2")).toBe(false);
        });
        it("does not fire equals/contains/greater_than for an empty conditionStepId", () => {
          const baseRule = {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "step" as const,
            targetStepId: "step-2", targetSectionId: null,
            conditionStepId: "",
            action: "show" as const,
            order: 1, createdAt: null, updatedAt: null,
          };
          const data = { "step-1": "yes" };

          expect(evaluateRules([{ ...baseRule, when: cond("", "equals", "yes") }], data).visibleSteps.has("step-2")).toBe(false);
          expect(evaluateRules([{ ...baseRule, when: cond("", "contains", "yes") }], data).visibleSteps.has("step-2")).toBe(false);
          expect(evaluateRules([{ ...baseRule, when: cond("", "greater_than", "yes") }], data).visibleSteps.has("step-2")).toBe(false);
        });
        it("still fires is_empty normally once conditionStepId resolves to a real step", () => {
          // Guardrail: the RUN2-11 fix must not change legitimate is_empty
          // behavior for a step that genuinely has no value yet.
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "section",
              targetSectionId: "B", targetStepId: null,
              conditionStepId: "q1",
              when: cond("q1", "is_empty", null),
              action: "hide",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const result = evaluateRules(rules, {});
          expect(result.hiddenSections.has("B")).toBe(true);
        });
      });
      describe("Unknown operator", () => {
        it("should return false and log warning for unknown operator", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              when: cond("step-1", "unknown_operator", "test"),
              action: "show",
              order: 1, createdAt: null, updatedAt: null,
            },
          ];
          const data = { "step-1": "test" };
          const result = evaluateRules(rules, data);
          expect(result.visibleSteps.has("step-2")).toBe(false);
        });
      });
    });
    describe("Edge cases", () => {
      it("should handle empty rules array", () => {
        const result = evaluateRules([], {});
        expect(result.visibleSections.size).toBe(0);
        expect(result.hiddenSections.size).toBe(0);
        expect(result.visibleSteps.size).toBe(0);
        expect(result.hiddenSteps.size).toBe(0);
        expect(result.requiredSteps.size).toBe(0);
      });
      it("should handle empty data", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "step",
            targetStepId: "step-2", targetSectionId: null,
            conditionStepId: "step-1",
            when: cond("step-1", "equals", "yes"),
            action: "show",
            order: 1, createdAt: null, updatedAt: null,
          },
        ];
        const result = evaluateRules(rules, {});
        expect(result.visibleSteps.has("step-2")).toBe(false);
      });
      it("should handle missing condition value (undefined)", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "step",
            targetStepId: "step-2", targetSectionId: null,
            conditionStepId: "step-missing",
            when: cond("step-missing", "equals", "yes"),
            action: "show",
            order: 1, createdAt: null, updatedAt: null,
          },
        ];
        const data = { "step-1": "yes" };
        const result = evaluateRules(rules, data);
        expect(result.visibleSteps.has("step-2")).toBe(false);
      });
      it("should process multiple rules in order", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "step",
            targetStepId: "step-2", targetSectionId: null,
            conditionStepId: "step-1",
            when: cond("step-1", "equals", "yes"),
            action: "show",
            order: 1, createdAt: null, updatedAt: null,
          },
          {
            id: "rule-2",
            workflowId: "wf-1",
            targetType: "step",
            targetStepId: "step-3", targetSectionId: null,
            conditionStepId: "step-1",
            when: cond("step-1", "equals", "yes"),
            action: "require",
            order: 2, createdAt: null, updatedAt: null,
          },
        ];
        const data = { "step-1": "yes" };
        const result = evaluateRules(rules, data);
        expect(result.visibleSteps.has("step-2")).toBe(true);
        expect(result.requiredSteps.has("step-3")).toBe(true);
      });
    });
  });
  describe("calculateNextSection", () => {
    const sections = [
      { id: "sec-1", order: 1 },
      { id: "sec-2", order: 2 },
      { id: "sec-3", order: 3 },
      { id: "sec-4", order: 4 },
    ];
    it("should return first visible section when currentSectionId is null", () => {
      const visibleSections = new Set(["sec-1", "sec-3"]);
      const result = calculateNextSection(null, sections, visibleSections);
      expect(result).toBe("sec-1");
    });
    it("should return next visible section", () => {
      const visibleSections = new Set(["sec-1", "sec-2", "sec-4"]);
      const result = calculateNextSection("sec-1", sections, visibleSections);
      expect(result).toBe("sec-2");
    });
    it("should skip hidden sections", () => {
      const visibleSections = new Set(["sec-1", "sec-4"]);
      const result = calculateNextSection("sec-1", sections, visibleSections);
      expect(result).toBe("sec-4");
    });
    it("should return null when no more visible sections", () => {
      const visibleSections = new Set(["sec-1", "sec-2"]);
      const result = calculateNextSection("sec-2", sections, visibleSections);
      expect(result).toBe(null);
    });
    it("should return null for non-existent current section", () => {
      const visibleSections = new Set(["sec-1", "sec-2"]);
      const result = calculateNextSection("sec-999", sections, visibleSections);
      expect(result).toBe(null);
    });
    it("should handle empty visible sections", () => {
      const visibleSections = new Set<string>();
      const result = calculateNextSection(null, sections, visibleSections);
      expect(result).toBe(null);
    });
    it("should handle sections in random order", () => {
      const unorderedSections = [
        { id: "sec-3", order: 3 },
        { id: "sec-1", order: 1 },
        { id: "sec-2", order: 2 },
      ];
      const visibleSections = new Set(["sec-1", "sec-2", "sec-3"]);
      const result = calculateNextSection("sec-1", unorderedSections, visibleSections);
      expect(result).toBe("sec-2");
    });
  });
  describe("resolveNextSection", () => {
    const sections = [
      { id: "sec-1", order: 1 },
      { id: "sec-2", order: 2 },
      { id: "sec-3", order: 3 },
      { id: "sec-4", order: 4 },
    ];
    it("should use skipToSectionId when provided, visible, and forward of current", () => {
      const visibleSections = new Set(["sec-1", "sec-2", "sec-3", "sec-4"]);
      const result = resolveNextSection("sec-1", "sec-2", "sec-4", sections, visibleSections);
      expect(result).toBe("sec-4");
    });
    it("should find next visible section when forward skip target is not visible", () => {
      const visibleSections = new Set(["sec-1", "sec-2", "sec-4"]);
      const result = resolveNextSection("sec-1", "sec-2", "sec-3", sections, visibleSections);
      // sec-3 is not visible, so should get next visible after sec-3, which is sec-4
      expect(result).toBe("sec-4");
    });
    it("should use normal next section when no skip target", () => {
      const visibleSections = new Set(["sec-1", "sec-2", "sec-3"]);
      const result = resolveNextSection("sec-1", "sec-2", undefined, sections, visibleSections);
      expect(result).toBe("sec-2");
    });
    it("should return null when forward skip target has no visible sections after", () => {
      const visibleSections = new Set(["sec-1", "sec-2"]);
      const result = resolveNextSection("sec-2", "sec-2", "sec-4", sections, visibleSections);
      expect(result).toBe(null);
    });
    it("should treat a skip target at or before the current section as a no-op (backwards skip)", () => {
      // RUN2-2: a backwards skip_to (target order < current order) must not
      // override normal flow, or the run loops forever on the same section.
      const visibleSections = new Set(["sec-1", "sec-2", "sec-3", "sec-4"]);
      const result = resolveNextSection("sec-2", "sec-3", "sec-1", sections, visibleSections);
      // Falls through to the normal next section, ignoring the backwards skip.
      expect(result).toBe("sec-3");
    });
    it("should treat a skip target equal to the current section as a no-op (same-order skip)", () => {
      const visibleSections = new Set(["sec-1", "sec-2", "sec-3", "sec-4"]);
      const result = resolveNextSection("sec-2", "sec-3", "sec-2", sections, visibleSections);
      expect(result).toBe("sec-3");
    });
    it("should allow a skip target at the start of the run (no current section) regardless of order", () => {
      const visibleSections = new Set(["sec-1", "sec-2", "sec-3", "sec-4"]);
      const result = resolveNextSection(null, "sec-1", "sec-3", sections, visibleSections);
      expect(result).toBe("sec-3");
    });
    it("regression: six consecutive calls from a backwards-skip workflow terminate rather than repeating one id", () => {
      // Mirrors the audit probe: sections A(1), B(2), C(3), all visible, one
      // rule "skip_to A" that keeps firing (its trigger condition never
      // changes). Before the fix this produced A -> A -> A -> A -> A -> A
      // forever. After the fix the run must progress and terminate.
      const loopSections = [
        { id: "A", order: 1 },
        { id: "B", order: 2 },
        { id: "C", order: 3 },
      ];
      const visibleSections = new Set(["A", "B", "C"]);
      const skipToSectionId = "A";

      const visited: (string | null)[] = [];
      let current: string | null = "B";
      for (let i = 0; i < 6; i++) {
        const nextSectionId = calculateNextSection(current, loopSections, visibleSections);
        const resolved: string | null = resolveNextSection(
          current,
          nextSectionId,
          skipToSectionId,
          loopSections,
          visibleSections
        );
        visited.push(resolved);
        if (resolved !== null) {
          // Workflow still in progress - the respondent advances to it.
          current = resolved;
        }
        // Once resolved is null the run is complete; further "Next" presses
        // (simulated here) must keep terminating, not snap back to "A".
      }

      expect(visited).toHaveLength(6);
      expect(visited).not.toEqual(["A", "A", "A", "A", "A", "A"]);
      expect(visited).toContain(null);
    });
  });
  describe("validateRequiredSteps", () => {
    it("should return valid when all required steps have values", () => {
      const requiredSteps = new Set(["step-1", "step-2"]);
      const data = {
        "step-1": "value1",
        "step-2": "value2",
      };
      const result = validateRequiredSteps(requiredSteps, data);
      expect(result.valid).toBe(true);
      expect(result.missingSteps).toEqual([]);
    });
    it("should return invalid when required steps are missing", () => {
      const requiredSteps = new Set(["step-1", "step-2", "step-3"]);
      const data = {
        "step-1": "value1",
      };
      const result = validateRequiredSteps(requiredSteps, data);
      expect(result.valid).toBe(false);
      expect(result.missingSteps).toContain("step-2");
      expect(result.missingSteps).toContain("step-3");
    });
    it("should consider empty strings as missing", () => {
      const requiredSteps = new Set(["step-1"]);
      const data = {
        "step-1": "   ",
      };
      const result = validateRequiredSteps(requiredSteps, data);
      expect(result.valid).toBe(false);
      expect(result.missingSteps).toContain("step-1");
    });
    it("should consider empty arrays as missing", () => {
      const requiredSteps = new Set(["step-1"]);
      const data = {
        "step-1": [],
      };
      const result = validateRequiredSteps(requiredSteps, data);
      expect(result.valid).toBe(false);
      expect(result.missingSteps).toContain("step-1");
    });
    it("should consider null as missing", () => {
      const requiredSteps = new Set(["step-1"]);
      const data = {
        "step-1": null,
      };
      const result = validateRequiredSteps(requiredSteps, data);
      expect(result.valid).toBe(false);
      expect(result.missingSteps).toContain("step-1");
    });
    it("should handle empty required steps set", () => {
      const requiredSteps = new Set<string>();
      const data = {};
      const result = validateRequiredSteps(requiredSteps, data);
      expect(result.valid).toBe(true);
      expect(result.missingSteps).toEqual([]);
    });
    it("should not consider 0 or false as empty", () => {
      const requiredSteps = new Set(["step-1", "step-2"]);
      const data = {
        "step-1": 0,
        "step-2": false,
      };
      const result = validateRequiredSteps(requiredSteps, data);
      expect(result.valid).toBe(true);
      expect(result.missingSteps).toEqual([]);
    });
  });
  describe("getEffectiveRequiredSteps", () => {
    it("should return initial required steps when no rules apply", () => {
      const initialRequired = new Set(["step-1", "step-2"]);
      const rules: LogicRule[] = [];
      const data = {};
      const result = getEffectiveRequiredSteps(initialRequired, rules, data);
      expect(result).toEqual(initialRequired);
    });
    it("should add steps when require rule is triggered", () => {
      const initialRequired = new Set(["step-1"]);
      const rules: LogicRule[] = [
        {
          id: "rule-1",
          workflowId: "wf-1",
          targetType: "step",
          targetStepId: "step-2", targetSectionId: null,
          conditionStepId: "step-1",
          when: cond("step-1", "equals", "yes"),
          action: "require",
          order: 1, createdAt: null, updatedAt: null,
        },
      ];
      const data = { "step-1": "yes" };
      const result = getEffectiveRequiredSteps(initialRequired, rules, data);
      expect(result.has("step-1")).toBe(true);
      expect(result.has("step-2")).toBe(true);
    });
    it("should remove steps when make_optional rule is triggered", () => {
      const initialRequired = new Set(["step-1", "step-2"]);
      const rules: LogicRule[] = [
        {
          id: "rule-1",
          workflowId: "wf-1",
          targetType: "step",
          targetStepId: "step-2", targetSectionId: null,
          conditionStepId: "step-1",
          when: cond("step-1", "equals", "yes"),
          action: "make_optional",
          order: 1, createdAt: null, updatedAt: null,
        },
      ];
      const data = { "step-1": "yes" };
      const result = getEffectiveRequiredSteps(initialRequired, rules, data);
      expect(result.has("step-1")).toBe(true);
      expect(result.has("step-2")).toBe(false);
    });
    it("should ignore rules that don't target requirements", () => {
      const initialRequired = new Set(["step-1"]);
      const rules: LogicRule[] = [
        {
          id: "rule-1",
          workflowId: "wf-1",
          targetType: "step",
          targetStepId: "step-2", targetSectionId: null,
          conditionStepId: "step-1",
          when: cond("step-1", "equals", "yes"),
          action: "show",
          order: 1, createdAt: null, updatedAt: null,
        },
      ];
      const data = { "step-1": "yes" };
      const result = getEffectiveRequiredSteps(initialRequired, rules, data);
      expect(result).toEqual(initialRequired);
    });
    it("should ignore section-level rules", () => {
      const initialRequired = new Set(["step-1"]);
      const rules: LogicRule[] = [
        {
          id: "rule-1",
          workflowId: "wf-1",
          targetType: "section",
          targetSectionId: "sec-1", targetStepId: null,
          conditionStepId: "step-1",
          when: cond("step-1", "equals", "yes"),
          action: "require" as "require" | "show" | "hide" | "make_optional" | "skip_to",
          order: 1, createdAt: null, updatedAt: null,
        },
      ];
      const data = { "step-1": "yes" };
      const result = getEffectiveRequiredSteps(initialRequired, rules, data);
      expect(result).toEqual(initialRequired);
    });
    it("should not modify original set", () => {
      const initialRequired = new Set(["step-1"]);
      const rules: LogicRule[] = [
        {
          id: "rule-1",
          workflowId: "wf-1",
          targetType: "step",
          targetStepId: "step-2", targetSectionId: null,
          conditionStepId: "step-1",
          when: cond("step-1", "equals", "yes"),
          action: "require",
          order: 1, createdAt: null, updatedAt: null,
        },
      ];
      const data = { "step-1": "yes" };
      const result = getEffectiveRequiredSteps(initialRequired, rules, data);
      // Original should not change
      expect(initialRequired.has("step-2")).toBe(false);
      // Result should have step-2
      expect(result.has("step-2")).toBe(true);
    });
    it("should handle multiple rules modifying same step", () => {
      const initialRequired = new Set(["step-1"]);
      const rules: LogicRule[] = [
        {
          id: "rule-1",
          workflowId: "wf-1",
          targetType: "step",
          targetStepId: "step-2", targetSectionId: null,
          conditionStepId: "step-1",
          when: cond("step-1", "equals", "yes"),
          action: "require",
          order: 1, createdAt: null, updatedAt: null,
        },
        {
          id: "rule-2",
          workflowId: "wf-1",
          targetType: "step",
          targetStepId: "step-2", targetSectionId: null,
          conditionStepId: "step-3",
          when: cond("step-3", "equals", "no"),
          action: "make_optional",
          order: 2, createdAt: null, updatedAt: null,
        },
      ];
      const data = { "step-1": "yes", "step-3": "no" };
      const result = getEffectiveRequiredSteps(initialRequired, rules, data);
      // Last rule wins - step-2 should be optional
      expect(result.has("step-2")).toBe(false);
    });
  });
});
