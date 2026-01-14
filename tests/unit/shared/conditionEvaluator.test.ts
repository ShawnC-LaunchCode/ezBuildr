import { describe, it, expect } from "vitest";

import {
  evaluateConditionExpression,
  evaluateConditionExpressionWithDetails,
  evaluateWorkflowVisibility,
  describeConditionExpression,
  type DataMap,
  type AliasResolver,
} from "@shared/conditionEvaluator";
import type { ConditionExpression, Condition, ConditionGroup } from "@shared/types/conditions";

describe("conditionEvaluator", () => {
  describe("evaluateConditionExpression", () => {
    it("should return true for null expression (always visible)", () => {
      const result = evaluateConditionExpression(null as any, {});
      expect(result).toBe(true);
    });

    it("should return true for undefined expression", () => {
      const result = evaluateConditionExpression(undefined as any, {});
      expect(result).toBe(true);
    });

    it("should evaluate simple condition", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [
          {
            type: "condition", id: "c1",
            variable: "age",
            operator: "greater_than",
            value: 18,
            valueType: "constant",
          },
        ],
      };

      const data: DataMap = { age: 25 };
      const result = evaluateConditionExpression(expression, data);

      expect(result).toBe(true);
    });

    it("should return true for empty conditions array", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [],
      };

      const result = evaluateConditionExpression(expression, {});
      expect(result).toBe(true);
    });
  });

  describe("evaluateConditionExpressionWithDetails", () => {
    it("should return detailed result with reason", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [
          {
            type: "condition", id: "c1",
            variable: "status",
            operator: "equals",
            value: "active",
            valueType: "constant",
          },
        ],
      };

      const data: DataMap = { status: "active" };
      const result = evaluateConditionExpressionWithDetails(expression, data);

      expect(result.visible).toBe(true);
      expect(result.reason).toBe("Conditions satisfied");
      expect(result.evaluatedConditions).toBe(1);
    });

    it("should count multiple evaluated conditions", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [
          {
            type: "condition", id: "c1",
            variable: "age",
            operator: "greater_than",
            value: 18,
            valueType: "constant",
          },
          {
            type: "condition", id: "c1",
            variable: "country",
            operator: "equals",
            value: "US",
            valueType: "constant",
          },
        ],
      };

      const data: DataMap = { age: 25, country: "US" };
      const result = evaluateConditionExpressionWithDetails(expression, data);

      expect(result.visible).toBe(true);
      expect(result.evaluatedConditions).toBe(2);
    });

    it("should return reason when conditions not satisfied", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [
          {
            type: "condition", id: "c1",
            variable: "age",
            operator: "less_than",
            value: 18,
            valueType: "constant",
          },
        ],
      };

      const data: DataMap = { age: 25 };
      const result = evaluateConditionExpressionWithDetails(expression, data);

      expect(result.visible).toBe(false);
      expect(result.reason).toBe("Conditions not satisfied");
    });
  });

  describe("Group operators", () => {
    describe("AND operator", () => {
      it("should return true when all conditions are true", () => {
        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [
            {
              type: "condition", id: "c1",
              variable: "age",
              operator: "greater_than",
              value: 18,
              valueType: "constant",
            },
            {
              type: "condition", id: "c1",
              variable: "country",
              operator: "equals",
              value: "US",
              valueType: "constant",
            },
          ],
        };

        const data: DataMap = { age: 25, country: "US" };
        const result = evaluateConditionExpression(expression, data);

        expect(result).toBe(true);
      });

      it("should return false when any condition is false", () => {
        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [
            {
              type: "condition", id: "c1",
              variable: "age",
              operator: "greater_than",
              value: 18,
              valueType: "constant",
            },
            {
              type: "condition", id: "c1",
              variable: "country",
              operator: "equals",
              value: "UK",
              valueType: "constant",
            },
          ],
        };

        const data: DataMap = { age: 25, country: "US" };
        const result = evaluateConditionExpression(expression, data);

        expect(result).toBe(false);
      });
    });

    describe("OR operator", () => {
      it("should return true when any condition is true", () => {
        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "OR",
          conditions: [
            {
              type: "condition", id: "c1",
              variable: "age",
              operator: "less_than",
              value: 18,
              valueType: "constant",
            },
            {
              type: "condition", id: "c1",
              variable: "country",
              operator: "equals",
              value: "US",
              valueType: "constant",
            },
          ],
        };

        const data: DataMap = { age: 25, country: "US" };
        const result = evaluateConditionExpression(expression, data);

        expect(result).toBe(true);
      });

      it("should return false when all conditions are false", () => {
        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "OR",
          conditions: [
            {
              type: "condition", id: "c1",
              variable: "age",
              operator: "less_than",
              value: 18,
              valueType: "constant",
            },
            {
              type: "condition", id: "c1",
              variable: "country",
              operator: "equals",
              value: "UK",
              valueType: "constant",
            },
          ],
        };

        const data: DataMap = { age: 25, country: "US" };
        const result = evaluateConditionExpression(expression, data);

        expect(result).toBe(false);
      });
    });

    describe("Nested groups", () => {
      it("should evaluate nested AND/OR groups", () => {
        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [
            {
              type: "condition", id: "c1",
              variable: "age",
              operator: "greater_than",
              value: 18,
              valueType: "constant",
            },
            {
              type: "group", id: "g1",
              operator: "OR",
              conditions: [
                {
                  type: "condition", id: "c1",
                  variable: "country",
                  operator: "equals",
                  value: "US",
                  valueType: "constant",
                },
                {
                  type: "condition", id: "c1",
                  variable: "country",
                  operator: "equals",
                  value: "UK",
                  valueType: "constant",
                },
              ],
            },
          ],
        };

        const data: DataMap = { age: 25, country: "UK" };
        const result = evaluateConditionExpression(expression, data);

        expect(result).toBe(true);
      });

      it("should handle deeply nested groups", () => {
        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [
            {
              type: "group", id: "g1",
              operator: "OR",
              conditions: [
                {
                  type: "group", id: "g1",
                  operator: "AND",
                  conditions: [
                    {
                      type: "condition", id: "c1",
                      variable: "a",
                      operator: "equals",
                      value: 1,
                      valueType: "constant",
                    },
                    {
                      type: "condition", id: "c1",
                      variable: "b",
                      operator: "equals",
                      value: 2,
                      valueType: "constant",
                    },
                  ],
                },
              ],
            },
          ],
        };

        const data: DataMap = { a: 1, b: 2 };
        const result = evaluateConditionExpression(expression, data);

        expect(result).toBe(true);
      });
    });
  });

  describe("Comparison operators", () => {
    describe("equals", () => {
      it("should match equal strings (case-insensitive)", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "name",
          operator: "equals",
          value: "JOHN",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { name: "john" });
        expect(result).toBe(true);
      });

      it("should match equal numbers", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "count",
          operator: "equals",
          value: 42,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { count: 42 });
        expect(result).toBe(true);
      });

      it("should match booleans", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "active",
          operator: "equals",
          value: true,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { active: true });
        expect(result).toBe(true);
      });

      it("should match boolean string representations", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "active",
          operator: "equals",
          value: true,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { active: "true" });
        expect(result).toBe(true);
      });

      it("should match arrays", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "tags",
          operator: "equals",
          value: ["a", "b"],
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { tags: ["a", "b"] });
        expect(result).toBe(true);
      });

      it("should match objects", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "meta",
          operator: "equals",
          value: { x: 1, y: 2 },
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { meta: { x: 1, y: 2 } });
        expect(result).toBe(true);
      });

      it("should handle null/undefined equality", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "value",
          operator: "equals",
          value: null,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { value: null })).toBe(true);
        expect(evaluateConditionExpression(expression, { value: undefined })).toBe(true);
      });

      it("should coerce number strings", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "count",
          operator: "equals",
          value: "42",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { count: 42 });
        expect(result).toBe(true);
      });
    });

    describe("not_equals", () => {
      it("should return true for different values", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "status",
          operator: "not_equals",
          value: "inactive",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { status: "active" });
        expect(result).toBe(true);
      });

      it("should return false for equal values", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "status",
          operator: "not_equals",
          value: "active",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { status: "active" });
        expect(result).toBe(false);
      });
    });

    describe("contains", () => {
      it("should find substring in string (case-insensitive)", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "text",
          operator: "contains",
          value: "WORLD",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { text: "Hello World" });
        expect(result).toBe(true);
      });

      it("should return false when substring not found", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "text",
          operator: "contains",
          value: "xyz",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { text: "Hello World" });
        expect(result).toBe(false);
      });
    });

    describe("not_contains", () => {
      it("should return true when substring not found", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "text",
          operator: "not_contains",
          value: "xyz",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { text: "Hello World" });
        expect(result).toBe(true);
      });
    });

    describe("starts_with", () => {
      it("should match string prefix (case-insensitive)", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "text",
          operator: "starts_with",
          value: "HELLO",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { text: "Hello World" });
        expect(result).toBe(true);
      });
    });

    describe("ends_with", () => {
      it("should match string suffix (case-insensitive)", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "text",
          operator: "ends_with",
          value: "WORLD",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { text: "Hello World" });
        expect(result).toBe(true);
      });
    });

    describe("greater_than", () => {
      it("should compare numbers", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "age",
          operator: "greater_than",
          value: 18,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { age: 25 })).toBe(true);
        expect(evaluateConditionExpression(expression, { age: 15 })).toBe(false);
      });

      it("should parse string numbers", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "count",
          operator: "greater_than",
          value: "10",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { count: "20" });
        expect(result).toBe(true);
      });

      it("should handle dates", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "birthdate",
          operator: "greater_than",
          value: "2000-01-01",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { birthdate: "2010-01-01" });
        expect(result).toBe(true);
      });

      it("should convert booleans to numbers", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "flag",
          operator: "greater_than",
          value: false,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { flag: true });
        expect(result).toBe(true); // true (1) > false (0)
      });
    });

    describe("less_than", () => {
      it("should compare numbers", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "age",
          operator: "less_than",
          value: 18,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { age: 15 })).toBe(true);
        expect(evaluateConditionExpression(expression, { age: 25 })).toBe(false);
      });
    });

    describe("greater_or_equal", () => {
      it("should return true for greater value", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "score",
          operator: "greater_or_equal",
          value: 100,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { score: 150 })).toBe(true);
      });

      it("should return true for equal value", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "score",
          operator: "greater_or_equal",
          value: 100,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { score: 100 })).toBe(true);
      });

      it("should return false for lesser value", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "score",
          operator: "greater_or_equal",
          value: 100,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { score: 50 })).toBe(false);
      });
    });

    describe("less_or_equal", () => {
      it("should compare numbers correctly", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "score",
          operator: "less_or_equal",
          value: 100,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { score: 50 })).toBe(true);
        expect(evaluateConditionExpression(expression, { score: 100 })).toBe(true);
        expect(evaluateConditionExpression(expression, { score: 150 })).toBe(false);
      });
    });

    describe("between", () => {
      it("should check if value is between min and max (inclusive)", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "age",
          operator: "between",
          value: 18,
          value2: 65,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { age: 30 })).toBe(true);
        expect(evaluateConditionExpression(expression, { age: 18 })).toBe(true);
        expect(evaluateConditionExpression(expression, { age: 65 })).toBe(true);
        expect(evaluateConditionExpression(expression, { age: 10 })).toBe(false);
        expect(evaluateConditionExpression(expression, { age: 70 })).toBe(false);
      });
    });

    describe("is_true", () => {
      it("should return true for boolean true", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "active",
          operator: "is_true",
          value: null,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { active: true })).toBe(true);
      });

      it("should return true for truthy strings", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "active",
          operator: "is_true",
          value: null,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { active: "true" })).toBe(true);
        expect(evaluateConditionExpression(expression, { active: "yes" })).toBe(true);
        expect(evaluateConditionExpression(expression, { active: "1" })).toBe(true);
      });

      it("should return false for falsy values", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "active",
          operator: "is_true",
          value: null,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { active: false })).toBe(false);
        expect(evaluateConditionExpression(expression, { active: "false" })).toBe(false);
        expect(evaluateConditionExpression(expression, { active: 0 })).toBe(false);
      });
    });

    describe("is_false", () => {
      it("should return true for boolean false", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "active",
          operator: "is_false",
          value: null,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { active: false })).toBe(true);
      });
    });

    describe("is_empty", () => {
      it("should return true for null/undefined", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "value",
          operator: "is_empty",
          value: null,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { value: null })).toBe(true);
        expect(evaluateConditionExpression(expression, { value: undefined })).toBe(true);
      });

      it("should return true for empty string", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "text",
          operator: "is_empty",
          value: null,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { text: "" })).toBe(true);
        expect(evaluateConditionExpression(expression, { text: "   " })).toBe(true);
      });

      it("should return true for empty array", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "items",
          operator: "is_empty",
          value: null,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { items: [] })).toBe(true);
      });

      it("should return true for empty object", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "meta",
          operator: "is_empty",
          value: null,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition as any],
        };

        expect(evaluateConditionExpression(expression, { meta: {} })).toBe(true);
      });

      it("should return false for non-empty values", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "value",
          operator: "is_empty",
          value: null,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { value: "test" })).toBe(false);
        expect(evaluateConditionExpression(expression, { value: 0 })).toBe(false);
        expect(evaluateConditionExpression(expression, { value: false })).toBe(false);
      });
    });

    describe("is_not_empty", () => {
      it("should return true for non-empty values", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "value",
          operator: "is_not_empty",
          value: null,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { value: "test" })).toBe(true);
        expect(evaluateConditionExpression(expression, { value: ["a"] })).toBe(true);
        expect(evaluateConditionExpression(expression, { value: { x: 1 } })).toBe(true);
      });

      it("should return false for empty values", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "value",
          operator: "is_not_empty",
          value: null,
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { value: null })).toBe(false);
        expect(evaluateConditionExpression(expression, { value: "" })).toBe(false);
      });
    });

    describe("includes", () => {
      it("should check if array includes value", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "tags",
          operator: "includes",
          value: "important",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { tags: ["urgent", "important"] })).toBe(true);
        expect(evaluateConditionExpression(expression, { tags: ["urgent", "normal"] })).toBe(false);
      });

      it("should handle non-array values", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "value",
          operator: "includes",
          value: "test",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { value: "test" })).toBe(true);
      });
    });

    describe("not_includes", () => {
      it("should return true when array does not include value", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "tags",
          operator: "not_includes",
          value: "blocked",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { tags: ["urgent", "important"] })).toBe(true);
        expect(evaluateConditionExpression(expression, { tags: ["urgent", "blocked"] })).toBe(false);
      });
    });

    describe("includes_all", () => {
      it("should return true when array includes all required values", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "tags",
          operator: "includes_all",
          value: ["urgent", "important"],
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { tags: ["urgent", "important", "new"] })).toBe(true);
        expect(evaluateConditionExpression(expression, { tags: ["urgent", "new"] })).toBe(false);
      });
    });

    describe("includes_any", () => {
      it("should return true when array includes any of the values", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "tags",
          operator: "includes_any",
          value: ["urgent", "blocked"],
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        expect(evaluateConditionExpression(expression, { tags: ["important", "urgent"] })).toBe(true);
        expect(evaluateConditionExpression(expression, { tags: ["important", "new"] })).toBe(false);
      });
    });

    describe("Unknown operator", () => {
      it("should default to true and log warning", () => {
        const condition: Condition = {
          type: "condition", id: "c1",
          variable: "value",
          operator: "unknown_operator" as any,
          value: "test",
          valueType: "constant",
        };

        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [condition],
        };

        const result = evaluateConditionExpression(expression, { value: "test" });
        expect(result).toBe(true);
      });
    });
  });

  describe("Variable resolution", () => {
    const aliasResolver: AliasResolver = (aliasOrId: string) => {
      const aliases: Record<string, string> = {
        firstName: "step-uuid-123",
        lastName: "step-uuid-456",
        age: "step-uuid-789",
      };
      return aliases[aliasOrId];
    };

    it("should resolve alias to step ID when resolver is provided", () => {
      const condition: Condition = {
        type: "condition", id: "c1",
        variable: "firstName",
        operator: "equals",
        value: "John",
        valueType: "constant",
      };

      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [condition],
      };

      const data: DataMap = { "step-uuid-123": "John" };
      const result = evaluateConditionExpression(expression, data, aliasResolver);

      expect(result).toBe(true);
    });

    it("should fall back to original key if not resolved", () => {
      const condition: Condition = {
        type: "condition", id: "c1",
        variable: "unknownAlias",
        operator: "equals",
        value: "test",
        valueType: "constant",
      };

      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [condition],
      };

      const data: DataMap = { unknownAlias: "test" };
      const result = evaluateConditionExpression(expression, data, aliasResolver);

      expect(result).toBe(true);
    });

    it("should resolve variable references in value", () => {
      const condition: Condition = {
        type: "condition", id: "c1",
        variable: "firstName",
        operator: "equals",
        value: "lastName",
        valueType: "variable",
      };

      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [condition],
      };

      const data: DataMap = {
        "step-uuid-123": "Smith",
        "step-uuid-456": "Smith",
      };
      const result = evaluateConditionExpression(expression, data, aliasResolver);

      expect(result).toBe(true);
    });

    it("should skip conditions with no variable selected", () => {
      const condition: Condition = {
        type: "condition", id: "c1",
        variable: "",
        operator: "equals",
        value: "test",
        valueType: "constant",
      };

      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [condition],
      };

      const result = evaluateConditionExpression(expression, {});
      expect(result).toBe(true); // Empty variable should skip
    });
  });

  describe("evaluateWorkflowVisibility", () => {
    it("should evaluate visibility for all sections and steps", () => {
      const sections = [
        {
          id: "sec-1",
          visibleIf: {
            type: "group" as const,
            operator: "AND" as const,
            conditions: [
              {
                type: "condition" as const,
                variable: "showSec1",
                operator: "equals" as const,
                value: true,
                valueType: "constant" as const,
              },
            ],
          },
        },
        {
          id: "sec-2",
          visibleIf: null as any,
        },
      ];

      const steps = [
        {
          id: "step-1",
          visibleIf: {
            type: "group" as const,
            operator: "AND" as const,
            conditions: [
              {
                type: "condition" as const,
                variable: "age",
                operator: "greater_than" as const,
                value: 18,
                valueType: "constant" as const,
              },
            ],
          },
        },
        {
          id: "step-2",
          visibleIf: null as any,
        },
      ];

      const data: DataMap = {
        showSec1: true,
        age: 25,
      };

      const result = evaluateWorkflowVisibility(sections, steps, data);

      expect(result.sections["sec-1"]).toBe(true);
      expect(result.sections["sec-2"]).toBe(true); // null expression = always visible
      expect(result.steps["step-1"]).toBe(true);
      expect(result.steps["step-2"]).toBe(true);
    });
  });

  describe("describeConditionExpression", () => {
    it("should return 'Always visible' for null expression", () => {
      const result = describeConditionExpression(null as any);
      expect(result).toBe("Always visible");
    });

    it("should describe simple condition", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [
          {
            type: "condition", id: "c1",
            variable: "age",
            operator: "greater_than",
            value: 18,
            valueType: "constant",
          },
        ],
      };

      const result = describeConditionExpression(expression);
      expect(result).toContain("age");
      expect(result).toContain(">");
      expect(result).toContain("18");
    });

    it("should describe AND conditions", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [
          {
            type: "condition", id: "c1",
            variable: "age",
            operator: "greater_than",
            value: 18,
            valueType: "constant",
          },
          {
            type: "condition", id: "c1",
            variable: "country",
            operator: "equals",
            value: "US",
            valueType: "constant",
          },
        ],
      };

      const result = describeConditionExpression(expression);
      expect(result).toContain("AND");
    });

    it("should describe OR conditions", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "OR",
        conditions: [
          {
            type: "condition", id: "c1",
            variable: "age",
            operator: "less_than",
            value: 18,
            valueType: "constant",
          },
          {
            type: "condition", id: "c1",
            variable: "age",
            operator: "greater_than",
            value: 65,
            valueType: "constant",
          },
        ],
      };

      const result = describeConditionExpression(expression);
      expect(result).toContain("OR");
    });

    it("should use variable labels when provided", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [
          {
            type: "condition", id: "c1",
            variable: "step-uuid-123",
            operator: "equals",
            value: "test",
            valueType: "constant",
          },
        ],
      };

      const variableLabels = {
        "step-uuid-123": "First Name",
      };

      const result = describeConditionExpression(expression, variableLabels);
      expect(result).toContain("First Name");
    });

    it("should describe between operator", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [
          {
            type: "condition", id: "c1",
            variable: "age",
            operator: "between",
            value: 18,
            value2: 65,
            valueType: "constant",
          },
        ],
      };

      const result = describeConditionExpression(expression);
      expect(result).toContain("is between");
      expect(result).toContain("18");
      expect(result).toContain("65");
    });

    it("should describe operators without values", () => {
      const operators: Array<"is_true" | "is_false" | "is_empty" | "is_not_empty"> = [
        "is_true",
        "is_false",
        "is_empty",
        "is_not_empty",
      ];

      operators.forEach((op) => {
        const expression: ConditionExpression = {
          type: "group", id: "g1",
          operator: "AND",
          conditions: [
            {
              type: "condition", id: "c1",
              variable: "value",
              operator: op,
              value: null,
              valueType: "constant",
            },
          ],
        };

        const result = describeConditionExpression(expression);
        expect(result).toContain("value");
        expect(result.length).toBeGreaterThan(0);
      });
    });

    it("should describe variable references", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [
          {
            type: "condition", id: "c1",
            variable: "firstName",
            operator: "equals",
            value: "lastName",
            valueType: "variable",
          },
        ],
      };

      const variableLabels = {
        firstName: "First Name",
        lastName: "Last Name",
      };

      const result = describeConditionExpression(expression, variableLabels);
      expect(result).toContain("First Name");
      expect(result).toContain("Last Name");
    });

    it("should handle nested groups with parentheses", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [
          {
            type: "group", id: "g1",
            operator: "OR",
            conditions: [
              {
                type: "condition", id: "c1",
                variable: "a",
                operator: "equals",
                value: 1,
                valueType: "constant",
              },
              {
                type: "condition", id: "c1",
                variable: "b",
                operator: "equals",
                value: 2,
                valueType: "constant",
              },
            ],
          },
        ],
      };

      const result = describeConditionExpression(expression);
      expect(result).toContain("(");
      expect(result).toContain(")");
      expect(result).toContain("OR");
    });

    it("should format array values", () => {
      const expression: ConditionExpression = {
        type: "group", id: "g1",
        operator: "AND",
        conditions: [
          {
            type: "condition", id: "c1",
            variable: "tags",
            operator: "includes_all",
            value: ["urgent", "important"],
            valueType: "constant",
          },
        ],
      };

      const result = describeConditionExpression(expression);
      expect(result).toContain("[");
      expect(result).toContain("]");
    });
  });
});
