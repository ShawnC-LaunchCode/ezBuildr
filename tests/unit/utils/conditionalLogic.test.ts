import { describe, it, expect } from "vitest";
import {
  evaluateCondition,
  evaluateConditionalLogic,
  type ConditionalRule,
  type EvaluationContext,
} from "../../../shared/conditionalLogic";

describe("conditionalLogic", () => {
  describe("evaluateCondition", () => {
    describe("equals operator", () => {
      it("should return true for exact string match", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "equals",
          conditionValue: "yes",
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", "yes"]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it("should return false for non-matching string", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "equals",
          conditionValue: "yes",
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", "no"]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(false);
      });

      it("should handle numeric equality", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "equals",
          conditionValue: 42,
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", 42]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(true);
      });
    });

    describe("not_equals operator", () => {
      it("should return true for different values", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "not_equals",
          conditionValue: "yes",
          action: "hide", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", "no"]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it("should return false for same values", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "not_equals",
          conditionValue: "yes",
          action: "hide", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", "yes"]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe("contains operator", () => {
      it("should find substring in string", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "contains",
          conditionValue: "feedback",
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", "I have some feedback about the product"]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it("should find item in array", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "contains",
          conditionValue: "option2",
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", ["option1", "option2", "option3"]]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it("should return false when not found", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "contains",
          conditionValue: "missing",
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", "no match here"]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe("greater_than operator", () => {
      it("should return true for greater number", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "greater_than",
          conditionValue: 50,
          action: "require", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", 75]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it("should return false for equal or smaller number", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "greater_than",
          conditionValue: 50,
          action: "require", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", 50]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe("less_than operator", () => {
      it("should return true for smaller number", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "less_than",
          conditionValue: 100,
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", 25]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it("should return false for equal or larger number", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "less_than",
          conditionValue: 100,
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", 100]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe("between operator", () => {
      it("should return true for value in range", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "between",
          conditionValue: { min: 10, max: 50 },
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", 30]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it("should return true for value at boundaries (inclusive)", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "between",
          conditionValue: { min: 10, max: 50 },
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const contextMin: EvaluationContext = {
          answers: new Map([["q1", 10]]),
          conditions: [],
        };

        const contextMax: EvaluationContext = {
          answers: new Map([["q1", 50]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, contextMin)).toBe(true);
        expect(evaluateCondition(condition, contextMax)).toBe(true);
      });

      it("should return false for value outside range", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "between",
          conditionValue: { min: 10, max: 50 },
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", 75]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe("is_empty operator", () => {
      it("should return true for null", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "is_empty",
          conditionValue: null,
          action: "hide", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", null]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it("should return true for undefined", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "is_empty",
          conditionValue: null,
          action: "hide", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", undefined]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it("should return true for empty string", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "is_empty",
          conditionValue: null,
          action: "hide", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", ""]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it("should return false for non-empty values", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "is_empty",
          conditionValue: null,
          action: "hide", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", "has value"]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(false);
      });
    });

    describe("is_not_empty operator", () => {
      it("should return true for non-empty string", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "is_not_empty",
          conditionValue: null,
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const context: EvaluationContext = {
          answers: new Map([["q1", "has value"]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, context)).toBe(true);
      });

      it("should return false for null/undefined/empty", () => {
        const condition: ConditionalRule = {
          conditionQuestionId: "q1",
          operator: "is_not_empty",
          conditionValue: null,
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        };

        const contextNull: EvaluationContext = {
          answers: new Map([["q1", null]]),
          conditions: [],
        };

        const contextEmpty: EvaluationContext = {
          answers: new Map([["q1", ""]]),
          conditions: [],
        };

        expect(evaluateCondition(condition, contextNull)).toBe(false);
        expect(evaluateCondition(condition, contextEmpty)).toBe(false);
      });
    });
  });

  describe("evaluateConditionalLogic", () => {
    it("should show question by default with no conditions", () => {
      const context: EvaluationContext = {
        answers: new Map(),
        conditions: [],
      };

      const result = evaluateConditionalLogic("q2", context);

      expect(result.visible).toBe(true);
      expect(result.required).toBe(false);
    });

    it("should apply show action when condition is met", () => {
      const conditions: ConditionalRule[] = [
        {
          conditionQuestionId: "q1",
          operator: "equals",
          conditionValue: "yes",
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        },
      ];

      const context: EvaluationContext = {
        answers: new Map([["q1", "yes"]]),
        conditions,
      };

      const result = evaluateConditionalLogic("q2", context);

      expect(result.visible).toBe(true);
    });

    it("should hide question when show condition is not met", () => {
      const conditions: ConditionalRule[] = [
        {
          conditionQuestionId: "q1",
          operator: "equals",
          conditionValue: "yes",
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        },
      ];

      const context: EvaluationContext = {
        answers: new Map([["q1", "no"]]),
        conditions,
      };

      const result = evaluateConditionalLogic("q2", context);

      expect(result.visible).toBe(false);
    });

    it("should apply hide action when condition is met", () => {
      const conditions: ConditionalRule[] = [
        {
          conditionQuestionId: "q1",
          operator: "equals",
          conditionValue: "skip",
          action: "hide", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        },
      ];

      const context: EvaluationContext = {
        answers: new Map([["q1", "skip"]]),
        conditions,
      };

      const result = evaluateConditionalLogic("q2", context);

      expect(result.visible).toBe(false);
    });

    it("should make question required when require action is met", () => {
      const conditions: ConditionalRule[] = [
        {
          conditionQuestionId: "q1",
          operator: "equals",
          conditionValue: "high",
          action: "require", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        },
      ];

      const context: EvaluationContext = {
        answers: new Map([["q1", "high"]]),
        conditions,
      };

      const result = evaluateConditionalLogic("q2", context);

      expect(result.required).toBe(true);
      expect(result.visible).toBe(true);
    });

    it("should make question optional when make_optional action is met", () => {
      const conditions: ConditionalRule[] = [
        {
          conditionQuestionId: "q1",
          operator: "equals",
          conditionValue: "low",
          action: "make_optional", id: "c1", createdAt: null, surveyId: "s1", order: 1, logicalOperator: null,
          targetQuestionId: "q2", targetPageId: null,
        },
      ];

      const context: EvaluationContext = {
        answers: new Map([["q1", "low"]]),
        conditions,
      };

      const result = evaluateConditionalLogic("q2", context);

      expect(result.required).toBe(false);
      expect(result.visible).toBe(true);
    });

    it("should handle multiple conditions with AND logic", () => {
      const conditions: ConditionalRule[] = [
        {
          conditionQuestionId: "q1",
          operator: "equals",
          conditionValue: "yes",
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1,
          targetQuestionId: "q3", targetPageId: null,
          logicalOperator: "AND",
        },
        {
          conditionQuestionId: "q2",
          operator: "equals",
          conditionValue: "high",
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1,
          targetQuestionId: "q3", targetPageId: null,
          logicalOperator: "AND",
        },
      ];

      const contextBothMet: EvaluationContext = {
        answers: new Map([
          ["q1", "yes"],
          ["q2", "high"],
        ]),
        conditions,
      };

      const contextOneMissing: EvaluationContext = {
        answers: new Map([
          ["q1", "yes"],
          ["q2", "low"],
        ]),
        conditions,
      };

      expect(evaluateConditionalLogic("q3", contextBothMet).visible).toBe(true);
      expect(evaluateConditionalLogic("q3", contextOneMissing).visible).toBe(false);
    });

    it("should handle multiple conditions with OR logic", () => {
      const conditions: ConditionalRule[] = [
        {
          conditionQuestionId: "q1",
          operator: "equals",
          conditionValue: "yes",
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1,
          targetQuestionId: "q3", targetPageId: null,
          logicalOperator: "OR",
        },
        {
          conditionQuestionId: "q2",
          operator: "equals",
          conditionValue: "high",
          action: "show", id: "c1", createdAt: null, surveyId: "s1", order: 1,
          targetQuestionId: "q3", targetPageId: null,
          logicalOperator: "OR",
        },
      ];

      const contextOneMet: EvaluationContext = {
        answers: new Map([
          ["q1", "yes"],
          ["q2", "low"],
        ]),
        conditions,
      };

      const contextNoneMet: EvaluationContext = {
        answers: new Map([
          ["q1", "no"],
          ["q2", "low"],
        ]),
        conditions,
      };

      expect(evaluateConditionalLogic("q3", contextOneMet).visible).toBe(true);
      expect(evaluateConditionalLogic("q3", contextNoneMet).visible).toBe(false);
    });
  });
});
