/* eslint-disable max-nested-callbacks */
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, it, expect } from "vitest";

import type { Step } from "@shared/schema";

import {
  validatePage,
  formatValidationErrors,
  getFieldError,
  type PageValidationResult,
} from "../../../server/workflows/validation";
describe("validation", () => {
  describe("validatePage", () => {
    it("should validate all visible steps", async () => {
      const steps: Step[] = [
        {
          id: "step-1",
          workflowId: "wf-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Name",
          description: null,
          required: true,
          order: 1,
          config: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
          deletedAt: null,
        },
        {
          id: "step-2",
          workflowId: "wf-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Email",
          description: null,
          required: true,
          order: 2,
          config: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
          deletedAt: null,
        },
      ];
      const values = {
        "step-1": "John Doe",
        "step-2": "",
      };
      const visibleStepIds = ["step-1", "step-2"];
      const result = await validatePage(steps, values, visibleStepIds);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].fieldId).toBe("step-2");
      expect(result.errors[0].errors).toContain("Email is required");
    });
    it("should skip hidden steps", async () => {
      const steps: Step[] = [
        {
          id: "step-1",
          workflowId: "wf-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Name",
          description: null,
          required: true,
          order: 1,
          config: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
          deletedAt: null,
        },
        {
          id: "step-2",
          workflowId: "wf-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Hidden Field",
          description: null,
          required: true,
          order: 2,
          config: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
          deletedAt: null,
        },
      ];
      const values = {
        "step-1": "John Doe",
        // step-2 is empty but hidden
      };
      const visibleStepIds = ["step-1"]; // step-2 is hidden
      const result = await validatePage(steps, values, visibleStepIds);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    it("should skip virtual steps", async () => {
      const steps: Step[] = [
        {
          id: "step-1",
          workflowId: "wf-1",
          sectionId: "sec-1",
          type: "computed",
          title: "Virtual Step",
          description: null,
          required: true,
          order: 1,
          config: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: true,
          visibleIf: null,
          defaultValue: null,
          deletedAt: null,
        },
      ];
      const values = {
        // No value for virtual step
      };
      const visibleStepIds = ["step-1"];
      const result = await validatePage(steps, values, visibleStepIds);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    it("should return valid result when all steps pass", async () => {
      const steps: Step[] = [
        {
          id: "step-1",
          workflowId: "wf-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Name",
          description: null,
          required: true,
          order: 1,
          config: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
          deletedAt: null,
        },
        {
          id: "step-2",
          workflowId: "wf-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Email",
          description: null,
          required: false,
          order: 2,
          config: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
          deletedAt: null,
        },
      ];
      const values = {
        "step-1": "John Doe",
        "step-2": "john@example.com",
      };
      const visibleStepIds = ["step-1", "step-2"];
      const result = await validatePage(steps, values, visibleStepIds);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.errorCount).toBe(0);
    });
    it("should count total errors correctly", async () => {
      const steps: Step[] = [
        {
          id: "step-1",
          workflowId: "wf-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Field 1",
          description: null,
          required: true,
          order: 1,
          config: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
          deletedAt: null,
        },
        {
          id: "step-2",
          workflowId: "wf-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Field 2",
          description: null,
          required: true,
          order: 2,
          config: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
          deletedAt: null,
        },
      ];
      const values = {
        "step-1": "",
        "step-2": "",
      };
      const visibleStepIds = ["step-1", "step-2"];
      const result = await validatePage(steps, values, visibleStepIds);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errorCount).toBe(2);
    });
    it("should handle empty steps array", async () => {
      const steps: Step[] = [];
      const values = {};
      const visibleStepIds: string[] = [];
      const result = await validatePage(steps, values, visibleStepIds);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.errorCount).toBe(0);
    });
    it("should handle missing values for non-required steps", async () => {
      const steps: Step[] = [
        {
          id: "step-1",
          workflowId: "wf-1",
          sectionId: "sec-1",
          type: "short_text",
          title: "Optional Field",
          description: null,
          required: false,
          order: 1,
          config: [],
          repeaterConfig: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          alias: null,
          isVirtual: false,
          visibleIf: null,
          defaultValue: null,
          deletedAt: null,
        },
      ];
      const values = {}; // No value provided
      const visibleStepIds = ["step-1"];
      const result = await validatePage(steps, values, visibleStepIds);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    describe("runner-unsupported/unknown step types (RUN2-3)", () => {
      // A required question of a type the runner cannot render (or does not
      // recognize) can never be answered by a respondent. validatePage must
      // skip these entirely — mirrors the client-side skip in
      // shared/validation/BlockValidation.ts so client and server agree.
      const unrequirableStep = (type: string, extra: Partial<Step> = {}): Step => ({
        id: "step-1",
        workflowId: "wf-1",
        sectionId: "sec-1",
        type,
        title: "Unsupported Field",
        description: null,
        required: true,
        order: 1,
        config: [],
        repeaterConfig: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        alias: null,
        isVirtual: false,
        visibleIf: null,
        defaultValue: null,
        deletedAt: null,
        ...extra,
      } as unknown as Step);

      it.each([
        ["file_upload", {}],
        ["loop_group", {}],
        ["repeater", { repeaterConfig: { minInstances: 2 } }],
        ["some_future_type", {}],
      ])("does not report a required %s step as missing when it has no value", async (type, extra) => {
        const steps = [unrequirableStep(type, extra)];
        const result = await validatePage(steps, {}, ["step-1"]);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("still blocks a required rendered type (short_text) with no value", async () => {
        const steps = [unrequirableStep("short_text")];
        const result = await validatePage(steps, {}, ["step-1"]);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
      });
    });
  });
  describe("formatValidationErrors", () => {
    it("should format errors into string array", async () => {
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
    it("should return empty array for no errors", async () => {
      const validationResult: PageValidationResult = {
        valid: true,
        errors: [],
        errorCount: 0,
      };
      const formatted = formatValidationErrors(validationResult);
      expect(formatted).toHaveLength(0);
    });
    it("should handle errors with multiple messages", async () => {
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
    it("should return first error for field", async () => {
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
    it("should return null when field has no errors", async () => {
      const validationResult: PageValidationResult = {
        valid: true,
        errors: [],
        errorCount: 0,
      };
      const error = getFieldError(validationResult, "step-1");
      expect(error).toBe(null);
    });
    it("should return null for non-existent field", async () => {
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
    it("should return null when field has empty errors array", async () => {
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
});
