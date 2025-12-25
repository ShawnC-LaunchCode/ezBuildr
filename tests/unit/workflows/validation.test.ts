import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  validateField,
  validatePage,
  formatValidationErrors,
  getFieldError,
  type FieldValidationConfig,
  type PageValidationResult,
} from "../../../server/workflows/validation";
import type { Step } from "@shared/schema";

// Mock the repeater service
vi.mock("../../../server/services/RepeaterService", () => ({
  repeaterService: {
    validateRepeater: vi.fn(() => ({
      valid: true,
      globalErrors: [],
      instanceErrors: new Map(),
    })),
  },
}));

describe("validation", () => {
  describe("validateField", () => {
    describe("Required validation", () => {
      it("should return error for empty required field", () => {
        const config: FieldValidationConfig = {
          required: true,
        };

        const errors = validateField("", config, "Email");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Email is required");
      });

      it("should return error for null required field", () => {
        const config: FieldValidationConfig = {
          required: true,
        };

        const errors = validateField(null, config, "Email");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Email is required");
      });

      it("should return error for undefined required field", () => {
        const config: FieldValidationConfig = {
          required: true,
        };

        const errors = validateField(undefined, config, "Email");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Email is required");
      });

      it("should return error for whitespace-only required field", () => {
        const config: FieldValidationConfig = {
          required: true,
        };

        const errors = validateField("   ", config, "Email");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Email is required");
      });

      it("should return error for empty array required field", () => {
        const config: FieldValidationConfig = {
          required: true,
        };

        const errors = validateField([], config, "Tags");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Tags is required");
      });

      it("should return error for empty object required field", () => {
        const config: FieldValidationConfig = {
          required: true,
        };

        const errors = validateField({}, config, "Metadata");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Metadata is required");
      });

      it("should not return error for 0 value", () => {
        const config: FieldValidationConfig = {
          required: true,
        };

        const errors = validateField(0, config, "Count");
        expect(errors).toHaveLength(0);
      });

      it("should not return error for false value", () => {
        const config: FieldValidationConfig = {
          required: true,
        };

        const errors = validateField(false, config, "Active");
        expect(errors).toHaveLength(0);
      });

      it("should stop validation after required check fails", () => {
        const config: FieldValidationConfig = {
          required: true,
          minLength: 5,
        };

        const errors = validateField("", config, "Password");
        // Should only have required error, not minLength error
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Password is required");
      });
    });

    describe("String length validation", () => {
      it("should validate minimum length", () => {
        const config: FieldValidationConfig = {
          minLength: 5,
        };

        const errors = validateField("abc", config, "Username");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Username must be at least 5 characters");
      });

      it("should validate maximum length", () => {
        const config: FieldValidationConfig = {
          maxLength: 10,
        };

        const errors = validateField("this is too long", config, "Username");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Username must be at most 10 characters");
      });

      it("should pass when length is within bounds", () => {
        const config: FieldValidationConfig = {
          minLength: 5,
          maxLength: 10,
        };

        const errors = validateField("valid", config, "Username");
        expect(errors).toHaveLength(0);
      });

      it("should accept exact minimum length", () => {
        const config: FieldValidationConfig = {
          minLength: 5,
        };

        const errors = validateField("exact", config, "Username");
        expect(errors).toHaveLength(0);
      });

      it("should accept exact maximum length", () => {
        const config: FieldValidationConfig = {
          maxLength: 5,
        };

        const errors = validateField("exact", config, "Username");
        expect(errors).toHaveLength(0);
      });

      it("should skip length validation for non-string values", () => {
        const config: FieldValidationConfig = {
          minLength: 5,
        };

        const errors = validateField(123, config, "Count");
        expect(errors).toHaveLength(0);
      });

      it("should skip validation for empty non-required fields", () => {
        const config: FieldValidationConfig = {
          minLength: 5,
        };

        const errors = validateField("", config, "Optional Field");
        expect(errors).toHaveLength(0);
      });
    });

    describe("Numeric range validation", () => {
      it("should validate minimum value", () => {
        const config: FieldValidationConfig = {
          min: 18,
        };

        const errors = validateField(15, config, "Age");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Age must be at least 18");
      });

      it("should validate maximum value", () => {
        const config: FieldValidationConfig = {
          max: 100,
        };

        const errors = validateField(150, config, "Score");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Score must be at most 100");
      });

      it("should pass when value is within range", () => {
        const config: FieldValidationConfig = {
          min: 18,
          max: 100,
        };

        const errors = validateField(50, config, "Age");
        expect(errors).toHaveLength(0);
      });

      it("should accept exact minimum value", () => {
        const config: FieldValidationConfig = {
          min: 18,
        };

        const errors = validateField(18, config, "Age");
        expect(errors).toHaveLength(0);
      });

      it("should accept exact maximum value", () => {
        const config: FieldValidationConfig = {
          max: 100,
        };

        const errors = validateField(100, config, "Score");
        expect(errors).toHaveLength(0);
      });

      it("should parse string numbers", () => {
        const config: FieldValidationConfig = {
          min: 18,
        };

        const errors1 = validateField("15", config, "Age");
        expect(errors1).toHaveLength(1);

        const errors2 = validateField("25", config, "Age");
        expect(errors2).toHaveLength(0);
      });

      it("should handle NaN gracefully", () => {
        const config: FieldValidationConfig = {
          min: 18,
        };

        const errors = validateField("not a number", config, "Age");
        // Should not crash, but validation behavior may vary
        expect(Array.isArray(errors)).toBe(true);
      });
    });

    describe("Email validation", () => {
      it("should validate correct email format", () => {
        const config: FieldValidationConfig = {
          email: true,
        };

        const errors = validateField("user@example.com", config, "Email");
        expect(errors).toHaveLength(0);
      });

      it("should reject email without @", () => {
        const config: FieldValidationConfig = {
          email: true,
        };

        const errors = validateField("userexample.com", config, "Email");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Email must be a valid email address");
      });

      it("should reject email without domain", () => {
        const config: FieldValidationConfig = {
          email: true,
        };

        const errors = validateField("user@", config, "Email");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Email must be a valid email address");
      });

      it("should reject email without TLD", () => {
        const config: FieldValidationConfig = {
          email: true,
        };

        const errors = validateField("user@example", config, "Email");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Email must be a valid email address");
      });

      it("should accept email with subdomains", () => {
        const config: FieldValidationConfig = {
          email: true,
        };

        const errors = validateField("user@mail.example.com", config, "Email");
        expect(errors).toHaveLength(0);
      });

      it("should accept email with plus addressing", () => {
        const config: FieldValidationConfig = {
          email: true,
        };

        const errors = validateField("user+tag@example.com", config, "Email");
        expect(errors).toHaveLength(0);
      });

      it("should accept email with numbers", () => {
        const config: FieldValidationConfig = {
          email: true,
        };

        const errors = validateField("user123@example.com", config, "Email");
        expect(errors).toHaveLength(0);
      });

      it("should skip email validation for non-string values", () => {
        const config: FieldValidationConfig = {
          email: true,
        };

        const errors = validateField(123, config, "Email");
        expect(errors).toHaveLength(0);
      });
    });

    describe("Pattern (regex) validation", () => {
      it("should validate with valid pattern", () => {
        const config: FieldValidationConfig = {
          pattern: "^[A-Z]{3}$", // Three uppercase letters
        };

        const errors = validateField("ABC", config, "Code");
        expect(errors).toHaveLength(0);
      });

      it("should reject invalid pattern", () => {
        const config: FieldValidationConfig = {
          pattern: "^[A-Z]{3}$",
        };

        const errors = validateField("abc", config, "Code");
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBe("Code format is invalid");
      });

      it("should handle complex patterns", () => {
        const config: FieldValidationConfig = {
          pattern: "^\\d{3}-\\d{2}-\\d{4}$", // SSN format
        };

        const errors1 = validateField("123-45-6789", config, "SSN");
        expect(errors1).toHaveLength(0);

        const errors2 = validateField("123456789", config, "SSN");
        expect(errors2).toHaveLength(1);
      });

      it("should skip validation for invalid regex pattern", () => {
        const config: FieldValidationConfig = {
          pattern: "[invalid(regex", // Invalid regex
        };

        const errors = validateField("anything", config, "Field");
        // Should not crash, should skip validation
        expect(errors).toHaveLength(0);
      });

      it("should skip pattern validation for non-string values", () => {
        const config: FieldValidationConfig = {
          pattern: "^[A-Z]{3}$",
        };

        const errors = validateField(123, config, "Code");
        expect(errors).toHaveLength(0);
      });
    });

    describe("Custom validation", () => {
      it("should run custom validator", () => {
        const config: FieldValidationConfig = {
          custom: (value) => {
            if (value === "forbidden") {
              return "This value is not allowed";
            }
            return null;
          },
        };

        const errors1 = validateField("forbidden", config, "Field");
        expect(errors1).toHaveLength(1);
        expect(errors1[0]).toBe("This value is not allowed");

        const errors2 = validateField("allowed", config, "Field");
        expect(errors2).toHaveLength(0);
      });

      it("should handle custom validator returning null", () => {
        const config: FieldValidationConfig = {
          custom: () => null,
        };

        const errors = validateField("anything", config, "Field");
        expect(errors).toHaveLength(0);
      });

      it("should add custom error to other errors", () => {
        const config: FieldValidationConfig = {
          minLength: 10,
          custom: () => "Custom error",
        };

        const errors = validateField("short", config, "Field");
        expect(errors).toHaveLength(2);
        expect(errors[0]).toBe("Field must be at least 10 characters");
        expect(errors[1]).toBe("Custom error");
      });
    });

    describe("Multiple validations", () => {
      it("should return multiple errors when multiple validations fail", () => {
        const config: FieldValidationConfig = {
          minLength: 8,
          maxLength: 20,
          pattern: "^(?=.*[A-Z])(?=.*[0-9])", // Must contain uppercase and number
        };

        const errors = validateField("abc", config, "Password");
        expect(errors.length).toBeGreaterThan(1);
      });

      it("should pass all validations when value is valid", () => {
        const config: FieldValidationConfig = {
          required: true,
          minLength: 5,
          maxLength: 20,
          email: true,
        };

        const errors = validateField("user@example.com", config, "Email");
        expect(errors).toHaveLength(0);
      });
    });

    describe("Edge cases", () => {
      it("should handle empty config", () => {
        const config: FieldValidationConfig = {};
        const errors = validateField("anything", config, "Field");
        expect(errors).toHaveLength(0);
      });

      it("should handle null value with non-required field", () => {
        const config: FieldValidationConfig = {
          minLength: 5,
        };

        const errors = validateField(null, config, "Optional Field");
        expect(errors).toHaveLength(0);
      });

      it("should handle undefined value with non-required field", () => {
        const config: FieldValidationConfig = {
          minLength: 5,
        };

        const errors = validateField(undefined, config, "Optional Field");
        expect(errors).toHaveLength(0);
      });
    });
  });

  describe("validatePage", () => {
    it("should validate all visible steps", () => {
      const steps: Step[] = [
        {
          id: "step-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Name",
          description: null,
          required: true,
          order: 1,
          options: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
        },
        {
          id: "step-2",
          sectionId: "sec-1",
          type: "short_text",
          title: "Email",
          description: null,
          required: true,
          order: 2,
          options: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
        },
      ];

      const values = {
        "step-1": "John Doe",
        "step-2": "",
      };

      const visibleStepIds = ["step-1", "step-2"];
      const result = validatePage(steps, values, visibleStepIds);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].fieldId).toBe("step-2");
      expect(result.errors[0].errors).toContain("Email is required");
    });

    it("should skip hidden steps", () => {
      const steps: Step[] = [
        {
          id: "step-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Name",
          description: null,
          required: true,
          order: 1,
          options: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
        },
        {
          id: "step-2",
          sectionId: "sec-1",
          type: "short_text",
          title: "Hidden Field",
          description: null,
          required: true,
          order: 2,
          options: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
        },
      ];

      const values = {
        "step-1": "John Doe",
        // step-2 is empty but hidden
      };

      const visibleStepIds = ["step-1"]; // step-2 is hidden
      const result = validatePage(steps, values, visibleStepIds);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should skip virtual steps", () => {
      const steps: Step[] = [
        {
          id: "step-1",
          sectionId: "sec-1",
          type: "computed",
          title: "Virtual Step",
          description: null,
          required: true,
          order: 1,
          options: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: true,
          visibleIf: null,
          defaultValue: null,
        },
      ];

      const values = {
        // No value for virtual step
      };

      const visibleStepIds = ["step-1"];
      const result = validatePage(steps, values, visibleStepIds);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should return valid result when all steps pass", () => {
      const steps: Step[] = [
        {
          id: "step-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Name",
          description: null,
          required: true,
          order: 1,
          options: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
        },
        {
          id: "step-2",
          sectionId: "sec-1",
          type: "short_text",
          title: "Email",
          description: null,
          required: false,
          order: 2,
          options: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
        },
      ];

      const values = {
        "step-1": "John Doe",
        "step-2": "john@example.com",
      };

      const visibleStepIds = ["step-1", "step-2"];
      const result = validatePage(steps, values, visibleStepIds);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.errorCount).toBe(0);
    });

    it("should count total errors correctly", () => {
      const steps: Step[] = [
        {
          id: "step-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Field 1",
          description: null,
          required: true,
          order: 1,
          options: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
        },
        {
          id: "step-2",
          sectionId: "sec-1",
          type: "short_text",
          title: "Field 2",
          description: null,
          required: true,
          order: 2,
          options: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
        },
      ];

      const values = {
        "step-1": "",
        "step-2": "",
      };

      const visibleStepIds = ["step-1", "step-2"];
      const result = validatePage(steps, values, visibleStepIds);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errorCount).toBe(2);
    });

    it("should handle empty steps array", () => {
      const steps: Step[] = [];
      const values = {};
      const visibleStepIds: string[] = [];

      const result = validatePage(steps, values, visibleStepIds);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.errorCount).toBe(0);
    });

    it("should handle missing values for non-required steps", () => {
      const steps: Step[] = [
        {
          id: "step-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Optional Field",
          description: null,
          required: false,
          order: 1,
          options: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
        },
      ];

      const values = {}; // No value provided

      const visibleStepIds = ["step-1"];
      const result = validatePage(steps, values, visibleStepIds);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("formatValidationErrors", () => {
    it("should format errors into string array", () => {
      const validationResult: PageValidationResult = {
        valid: false,
        errors: [
          {
            fieldId: "step-1",
            fieldTitle: "Name",
            errors: ["Name is required"],
          },
          {
            fieldId: "step-2",
            fieldTitle: "Email",
            errors: ["Email is required", "Email must be a valid email address"],
          },
        ],
        errorCount: 3,
      };

      const formatted = formatValidationErrors(validationResult);

      expect(formatted).toHaveLength(3);
      expect(formatted).toContain("Name is required");
      expect(formatted).toContain("Email is required");
      expect(formatted).toContain("Email must be a valid email address");
    });

    it("should return empty array for no errors", () => {
      const validationResult: PageValidationResult = {
        valid: true,
        errors: [],
        errorCount: 0,
      };

      const formatted = formatValidationErrors(validationResult);

      expect(formatted).toHaveLength(0);
    });

    it("should handle errors with multiple messages", () => {
      const validationResult: PageValidationResult = {
        valid: false,
        errors: [
          {
            fieldId: "step-1",
            fieldTitle: "Password",
            errors: [
              "Password is required",
              "Password must be at least 8 characters",
              "Password must contain uppercase letter",
            ],
          },
        ],
        errorCount: 3,
      };

      const formatted = formatValidationErrors(validationResult);

      expect(formatted).toHaveLength(3);
    });
  });

  describe("getFieldError", () => {
    it("should return first error for field", () => {
      const validationResult: PageValidationResult = {
        valid: false,
        errors: [
          {
            fieldId: "step-1",
            fieldTitle: "Password",
            errors: [
              "Password is required",
              "Password must be at least 8 characters",
            ],
          },
        ],
        errorCount: 2,
      };

      const error = getFieldError(validationResult, "step-1");

      expect(error).toBe("Password is required");
    });

    it("should return null when field has no errors", () => {
      const validationResult: PageValidationResult = {
        valid: true,
        errors: [],
        errorCount: 0,
      };

      const error = getFieldError(validationResult, "step-1");

      expect(error).toBe(null);
    });

    it("should return null for non-existent field", () => {
      const validationResult: PageValidationResult = {
        valid: false,
        errors: [
          {
            fieldId: "step-1",
            fieldTitle: "Name",
            errors: ["Name is required"],
          },
        ],
        errorCount: 1,
      };

      const error = getFieldError(validationResult, "step-999");

      expect(error).toBe(null);
    });

    it("should return null when field has empty errors array", () => {
      const validationResult: PageValidationResult = {
        valid: false,
        errors: [
          {
            fieldId: "step-1",
            fieldTitle: "Field",
            errors: [],
          },
        ],
        errorCount: 0,
      };

      const error = getFieldError(validationResult, "step-1");

      expect(error).toBe(null);
    });
  });

  describe("Edge cases and robustness", () => {
    it("should handle very long strings", () => {
      const config: FieldValidationConfig = {
        maxLength: 100,
      };

      const longString = "a".repeat(1000);
      const errors = validateField(longString, config, "Field");

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("at most 100 characters");
    });

    it("should handle special characters in strings", () => {
      const config: FieldValidationConfig = {
        minLength: 5,
      };

      const specialChars = "!@#$%^&*()";
      const errors = validateField(specialChars, config, "Field");

      expect(errors).toHaveLength(0);
    });

    it("should handle unicode characters", () => {
      const config: FieldValidationConfig = {
        minLength: 5,
      };

      const unicode = "🔥🎉💯😀👍";
      const errors = validateField(unicode, config, "Field");

      expect(errors).toHaveLength(0);
    });

    it("should handle negative numbers", () => {
      const config: FieldValidationConfig = {
        min: -100,
        max: 100,
      };

      const errors1 = validateField(-50, config, "Temperature");
      expect(errors1).toHaveLength(0);

      const errors2 = validateField(-150, config, "Temperature");
      expect(errors2).toHaveLength(1);
    });

    it("should handle decimal numbers", () => {
      const config: FieldValidationConfig = {
        min: 0,
        max: 1,
      };

      const errors1 = validateField(0.5, config, "Percentage");
      expect(errors1).toHaveLength(0);

      const errors2 = validateField(1.5, config, "Percentage");
      expect(errors2).toHaveLength(1);
    });

    it("should handle very large numbers", () => {
      const config: FieldValidationConfig = {
        max: 1000000000,
      };

      const errors = validateField(999999999, config, "Big Number");
      expect(errors).toHaveLength(0);
    });

    it("should handle objects as values", () => {
      const config: FieldValidationConfig = {
        required: true,
      };

      const errors = validateField({ key: "value" }, config, "Object Field");
      expect(errors).toHaveLength(0);
    });

    it("should handle arrays as values", () => {
      const config: FieldValidationConfig = {
        required: true,
      };

      const errors1 = validateField(["item1", "item2"], config, "Array Field");
      expect(errors1).toHaveLength(0);

      const errors2 = validateField([], config, "Array Field");
      expect(errors2).toHaveLength(1);
    });
  });
});
