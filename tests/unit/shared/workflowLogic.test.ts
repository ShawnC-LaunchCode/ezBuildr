import { describe, it, expect, beforeEach } from "vitest";

import type { LogicRule } from "@shared/schema";
import {
  evaluateRules,
  calculateNextSection,
  resolveNextSection,
  validateRequiredSteps,
  getEffectiveRequiredSteps,
  type LogicOperator,
} from "@shared/workflowLogic";

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
            operator: "equals",
            conditionValue: "yes",
            action: "show",
            order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
            operator: "equals",
            conditionValue: "no",
            action: "hide",
            order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
          },
        ];

        // First, add the section to visible set
        const data = { "step-1": "no" };
        const result = evaluateRules(rules, data);

        // Should not be in visible sections (delete doesn't error if not present)
        expect(result.visibleSections.has("sec-1")).toBe(false);
      });

      it("should set skip target when skip_to action is triggered", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "section",
            targetSectionId: "sec-3", targetStepId: null,
            conditionStepId: "step-1",
            operator: "equals",
            conditionValue: "skip",
            action: "skip_to",
            order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
          },
        ];

        const data = { "step-1": "skip" };
        const result = evaluateRules(rules, data);

        expect(result.skipToSectionId).toBe("sec-3");
      });

      it("should ignore rule with missing targetSectionId", () => {
        const rules: LogicRule[] = [
          {
            id: "rule-1",
            workflowId: "wf-1",
            targetType: "section",
            targetSectionId: null as any,
            targetStepId: null,
            conditionStepId: "step-1",
            operator: "equals",
            conditionValue: "yes",
            action: "show",
            order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
            operator: "equals",
            conditionValue: "yes",
            action: "show",
            order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
            operator: "equals",
            conditionValue: "no",
            action: "hide",
            order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
          },
        ];

        const data = { "step-1": "no" };
        const result = evaluateRules(rules, data);

        expect(result.visibleSteps.has("step-2")).toBe(false);
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
            operator: "equals",
            conditionValue: "yes",
            action: "require",
            order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
            operator: "equals",
            conditionValue: "yes",
            action: "make_optional",
            order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
            targetStepId: null as any,
            targetSectionId: null,
            conditionStepId: "step-1",
            operator: "equals",
            conditionValue: "yes",
            action: "show",
            order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "equals",
              conditionValue: "YES",
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "equals",
              conditionValue: true,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
            },
          ];

          const data = { "step-1": "true" };
          const result = evaluateRules(rules, data);

          expect(result.visibleSteps.has("step-2")).toBe(true);
        });

        it("should handle array equality (order-independent)", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              operator: "equals",
              conditionValue: ["b", "a"],
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
            },
          ];

          const data = { "step-1": ["a", "b"] };
          const result = evaluateRules(rules, data);

          expect(result.visibleSteps.has("step-2")).toBe(true);
        });

        it("should handle numeric equality", () => {
          const rules: LogicRule[] = [
            {
              id: "rule-1",
              workflowId: "wf-1",
              targetType: "step",
              targetStepId: "step-2", targetSectionId: null,
              conditionStepId: "step-1",
              operator: "equals",
              conditionValue: 42,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
            },
          ];

          const data = { "step-1": 42 };
          const result = evaluateRules(rules, data);

          expect(result.visibleSteps.has("step-2")).toBe(true);
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
              operator: "not_equals",
              conditionValue: "no",
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "contains",
              conditionValue: "WORLD",
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "contains",
              conditionValue: "apple",
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "contains",
              conditionValue: "test",
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "not_contains",
              conditionValue: "xyz",
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "greater_than",
              conditionValue: 10,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "greater_than",
              conditionValue: "10",
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "greater_than",
              conditionValue: 10,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "less_than",
              conditionValue: 30,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "between",
              conditionValue: { min: 10, max: 20 },
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "between",
              conditionValue: { min: 10, max: 20 },
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "between",
              conditionValue: { min: 10, max: 20 },
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "between",
              conditionValue: "invalid",
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "between",
              conditionValue: { min: 10, max: 20 },
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "is_empty",
              conditionValue: null,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "is_empty",
              conditionValue: null,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "is_empty",
              conditionValue: null,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "is_empty",
              conditionValue: null,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "is_empty",
              conditionValue: null,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "is_empty",
              conditionValue: null,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "is_not_empty",
              conditionValue: null,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
              operator: "is_not_empty",
              conditionValue: null,
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
            },
          ];

          const data = { "step-1": null };
          const result = evaluateRules(rules, data);

          expect(result.visibleSteps.has("step-2")).toBe(false);
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
              operator: "unknown_operator" as LogicOperator,
              conditionValue: "test",
              action: "show",
              order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
        expect(result.visibleSteps.size).toBe(0);
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
            operator: "equals",
            conditionValue: "yes",
            action: "show",
            order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
            operator: "equals",
            conditionValue: "yes",
            action: "show",
            order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
            operator: "equals",
            conditionValue: "yes",
            action: "show",
            order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
          },
          {
            id: "rule-2",
            workflowId: "wf-1",
            targetType: "step",
            targetStepId: "step-3", targetSectionId: null,
            conditionStepId: "step-1",
            operator: "equals",
            conditionValue: "yes",
            action: "require",
            order: 2, createdAt: null, updatedAt: null, logicalOperator: null,
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

    it("should use skipToSectionId when provided and visible", () => {
      const visibleSections = new Set(["sec-1", "sec-2", "sec-3", "sec-4"]);
      const result = resolveNextSection("sec-2", "sec-4", sections, visibleSections);

      expect(result).toBe("sec-4");
    });

    it("should find next visible section when skip target is not visible", () => {
      const visibleSections = new Set(["sec-1", "sec-2", "sec-4"]);
      const result = resolveNextSection("sec-2", "sec-3", sections, visibleSections);

      // sec-3 is not visible, so should get next visible after sec-3, which is sec-4
      expect(result).toBe("sec-4");
    });

    it("should use normal next section when no skip target", () => {
      const visibleSections = new Set(["sec-1", "sec-2", "sec-3"]);
      const result = resolveNextSection("sec-2", undefined, sections, visibleSections);

      expect(result).toBe("sec-2");
    });

    it("should return null when skip target has no visible sections after", () => {
      const visibleSections = new Set(["sec-1", "sec-2"]);
      const result = resolveNextSection("sec-2", "sec-4", sections, visibleSections);

      expect(result).toBe(null);
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
          operator: "equals",
          conditionValue: "yes",
          action: "require",
          order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
          operator: "equals",
          conditionValue: "yes",
          action: "make_optional",
          order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
          operator: "equals",
          conditionValue: "yes",
          action: "show",
          order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
          operator: "equals",
          conditionValue: "yes",
          action: "require" as any,
          order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
          operator: "equals",
          conditionValue: "yes",
          action: "require",
          order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
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
          operator: "equals",
          conditionValue: "yes",
          action: "require",
          order: 1, createdAt: null, updatedAt: null, logicalOperator: null,
        },
        {
          id: "rule-2",
          workflowId: "wf-1",
          targetType: "step",
          targetStepId: "step-2", targetSectionId: null,
          conditionStepId: "step-3",
          operator: "equals",
          conditionValue: "no",
          action: "make_optional",
          order: 2, createdAt: null, updatedAt: null, logicalOperator: null,
        },
      ];
      const data = { "step-1": "yes", "step-3": "no" };

      const result = getEffectiveRequiredSteps(initialRequired, rules, data);

      // Last rule wins - step-2 should be optional
      expect(result.has("step-2")).toBe(false);
    });
  });
});
