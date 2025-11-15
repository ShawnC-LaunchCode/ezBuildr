import { describe, it, expect } from "vitest";
import { VariableResolver } from "../../../server/utils/variableResolver";
import type { WorkflowVariable } from "@shared/schema";

describe("VariableResolver", () => {
  const mockVariables: WorkflowVariable[] = [
    {
      key: "step-uuid-123",
      alias: "firstName",
      title: "First Name",
      type: "short_text",
    },
    {
      key: "step-uuid-456",
      alias: "lastName",
      title: "Last Name",
      type: "short_text",
    },
    {
      key: "step-uuid-789",
      alias: null,
      title: "Email",
      type: "short_text",
    },
    {
      key: "step-uuid-101",
      alias: "age",
      title: "Age",
      type: "short_text",
    },
  ];

  describe("resolveOperand", () => {
    it("should resolve alias to key", () => {
      const result = VariableResolver.resolveOperand("firstName", mockVariables);

      expect(result).toBe("step-uuid-123");
    });

    it("should return key if operand is already a key", () => {
      const result = VariableResolver.resolveOperand("step-uuid-123", mockVariables);

      expect(result).toBe("step-uuid-123");
    });

    it("should return operand as-is if not found (for validation to catch)", () => {
      const result = VariableResolver.resolveOperand("unknownAlias", mockVariables);

      expect(result).toBe("unknownAlias");
    });

    it("should handle empty operand", () => {
      const result = VariableResolver.resolveOperand("", mockVariables);

      expect(result).toBe("");
    });

    it("should handle null-like operands", () => {
      // @ts-expect-error Testing runtime behavior
      const result = VariableResolver.resolveOperand(null, mockVariables);

      expect(result).toBe(null);
    });

    it("should be case-sensitive for aliases", () => {
      const result = VariableResolver.resolveOperand("firstname", mockVariables);

      // Should not match "firstName" (different case)
      expect(result).toBe("firstname");
      expect(result).not.toBe("step-uuid-123");
    });
  });

  describe("resolveOperands", () => {
    it("should resolve multiple aliases to keys", () => {
      const result = VariableResolver.resolveOperands(
        ["firstName", "lastName", "age"],
        mockVariables
      );

      expect(result).toEqual(["step-uuid-123", "step-uuid-456", "step-uuid-101"]);
    });

    it("should handle mix of aliases and keys", () => {
      const result = VariableResolver.resolveOperands(
        ["firstName", "step-uuid-456", "age"],
        mockVariables
      );

      expect(result).toEqual(["step-uuid-123", "step-uuid-456", "step-uuid-101"]);
    });

    it("should handle empty array", () => {
      const result = VariableResolver.resolveOperands([], mockVariables);

      expect(result).toEqual([]);
    });

    it("should preserve unknown operands", () => {
      const result = VariableResolver.resolveOperands(
        ["firstName", "unknown", "lastName"],
        mockVariables
      );

      expect(result).toEqual(["step-uuid-123", "unknown", "step-uuid-456"]);
    });
  });

  describe("getVariable", () => {
    it("should find variable by key", () => {
      const result = VariableResolver.getVariable("step-uuid-123", mockVariables);

      expect(result).toEqual({
        key: "step-uuid-123",
        alias: "firstName",
        title: "First Name",
        type: "short_text",
      });
    });

    it("should find variable by alias", () => {
      const result = VariableResolver.getVariable("firstName", mockVariables);

      expect(result).toEqual({
        key: "step-uuid-123",
        alias: "firstName",
        title: "First Name",
        type: "short_text",
      });
    });

    it("should return undefined if not found", () => {
      const result = VariableResolver.getVariable("nonexistent", mockVariables);

      expect(result).toBeUndefined();
    });

    it("should prioritize key match over alias match", () => {
      // Add a variable where key matches another's alias
      const conflictingVariables: WorkflowVariable[] = [
        ...mockVariables,
        {
          key: "firstName", // Same as another variable's alias
          alias: "conflictingAlias",
          title: "Conflicting",
          type: "short_text",
        },
      ];

      const result = VariableResolver.getVariable("firstName", conflictingVariables);

      // Should return the one where "firstName" is the key, not the alias
      expect(result?.key).toBe("firstName");
      expect(result?.alias).toBe("conflictingAlias");
    });

    it("should handle variable with null alias", () => {
      const result = VariableResolver.getVariable("step-uuid-789", mockVariables);

      expect(result).toEqual({
        key: "step-uuid-789",
        alias: null,
        title: "Email",
        type: "short_text",
      });
    });
  });

  describe("isValidOperand", () => {
    it("should return true for valid alias", () => {
      const result = VariableResolver.isValidOperand("firstName", mockVariables);

      expect(result).toBe(true);
    });

    it("should return true for valid key", () => {
      const result = VariableResolver.isValidOperand("step-uuid-123", mockVariables);

      expect(result).toBe(true);
    });

    it("should return false for invalid operand", () => {
      const result = VariableResolver.isValidOperand("nonexistent", mockVariables);

      expect(result).toBe(false);
    });

    it("should return false for empty operand", () => {
      const result = VariableResolver.isValidOperand("", mockVariables);

      expect(result).toBe(false);
    });

    it("should validate against empty variables array", () => {
      const result = VariableResolver.isValidOperand("firstName", []);

      expect(result).toBe(false);
    });
  });
});
