/**
 * RUN2-16 — the server is now authoritative for field validation, rolled out
 * behind SERVER_FIELD_VALIDATION. Before this, `validatePage` enforced only
 * `required` (everything else was a `// TODO: Extract from step.config`), so
 * every format rule was client-side-only and bypassable by posting directly to
 * the run value endpoints.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Step } from "@shared/schema";

import { validatePage } from "../../../server/workflows/validation";

vi.mock("../../../server/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function step(overrides: Partial<Step> & { id: string }): Step {
  return {
    workflowId: "wf-1",
    sectionId: "sec-1",
    title: "Field",
    type: "short_text",
    order: 0,
    required: false,
    isVirtual: false,
    config: {},
    alias: null,
    description: null,
    visibleIf: null,
    defaultValue: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Step;
}

const ORIGINAL_MODE = process.env.SERVER_FIELD_VALIDATION;

afterEach(() => {
  if (ORIGINAL_MODE === undefined) {
    delete process.env.SERVER_FIELD_VALIDATION;
  } else {
    process.env.SERVER_FIELD_VALIDATION = ORIGINAL_MODE;
  }
});

describe("server-side field validation (RUN2-16)", () => {
  describe("enforce mode", () => {
    it("rejects a value that violates a maxLength rule", async () => {
      process.env.SERVER_FIELD_VALIDATION = "enforce";
      const steps = [step({ id: "s1", title: "Nickname", config: { maxLength: 5 } })];

      const result = await validatePage(steps, { s1: "far too long" }, ["s1"]);

      expect(result.valid).toBe(false);
      expect(result.errors[0].fieldId).toBe("s1");
    });

    it("rejects a malformed email", async () => {
      process.env.SERVER_FIELD_VALIDATION = "enforce";
      const steps = [step({ id: "s1", title: "Email", type: "email" })];

      const result = await validatePage(steps, { s1: "not-an-email" }, ["s1"]);

      expect(result.valid).toBe(false);
    });

    it("accepts a conforming value", async () => {
      process.env.SERVER_FIELD_VALIDATION = "enforce";
      const steps = [step({ id: "s1", title: "Email", type: "email" })];

      const result = await validatePage(steps, { s1: "someone@example.com" }, ["s1"]);

      expect(result.valid).toBe(true);
    });
  });

  describe("warn mode (the shipped default)", () => {
    it("lets a format violation through instead of blocking the respondent", async () => {
      delete process.env.SERVER_FIELD_VALIDATION;
      const steps = [step({ id: "s1", title: "Nickname", config: { maxLength: 5 } })];

      const result = await validatePage(steps, { s1: "far too long" }, ["s1"]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("logs the divergence it chose not to block", async () => {
      delete process.env.SERVER_FIELD_VALIDATION;
      const { logger } = await import("../../../server/logger");
      vi.mocked(logger.warn).mockClear();

      const steps = [step({ id: "s1", title: "Email", type: "email" })];
      await validatePage(steps, { s1: "not-an-email" }, ["s1"]);

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(vi.mocked(logger.warn).mock.calls[0][0]).toMatchObject({ stepId: "s1" });
    });
  });

  describe("required is unchanged in both modes", () => {
    it.each(["warn", "enforce"])("still blocks an empty required field in %s mode", async (mode) => {
      process.env.SERVER_FIELD_VALIDATION = mode;
      const steps = [step({ id: "s1", title: "Email", type: "email", required: true })];

      const result = await validatePage(steps, {}, ["s1"]);

      expect(result.valid).toBe(false);
      // Byte-identical to the pre-RUN2-16 message respondents already saw.
      expect(result.errors[0].errors).toContain("Email is required");
    });

    it.each(["warn", "enforce"])("still allows an empty optional field in %s mode", async (mode) => {
      process.env.SERVER_FIELD_VALIDATION = mode;
      const steps = [step({ id: "s1", title: "Email", type: "email", required: false })];

      const result = await validatePage(steps, {}, ["s1"]);

      expect(result.valid).toBe(true);
    });
  });

  describe("unsafe author patterns never block a respondent", () => {
    it.each(["warn", "enforce"])(
      "skips a catastrophic pattern rather than failing the value, in %s mode",
      async (mode) => {
        process.env.SERVER_FIELD_VALIDATION = mode;
        const steps = [step({
          id: "s1",
          title: "Code",
          type: "text",
          config: { validation: { pattern: "(a+)+$" } },
        })];

        const started = Date.now();
        const result = await validatePage(steps, { s1: `${"a".repeat(40)}b` }, ["s1"]);
        const elapsed = Date.now() - started;

        expect(result.valid).toBe(true);
        expect(elapsed).toBeLessThan(500);
      }
    );

    it("still enforces a safe pattern in enforce mode", async () => {
      process.env.SERVER_FIELD_VALIDATION = "enforce";
      const steps = [step({
        id: "s1",
        title: "Code",
        type: "text",
        config: { validation: { pattern: "^[A-Z]{3}$" } },
      })];

      expect((await validatePage(steps, { s1: "abc" }, ["s1"])).valid).toBe(false);
      expect((await validatePage(steps, { s1: "ABC" }, ["s1"])).valid).toBe(true);
    });
  });
});
