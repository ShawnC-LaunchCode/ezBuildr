import { afterEach, describe, expect, it, vi } from "vitest";

import type { ListConfig, ListField, ListItem, ListValue } from "@shared/types/stepConfigs";
import {
  LIST_VALIDATION_MAX_DEPTH,
  LIST_VALIDATION_MAX_TOTAL_ITEMS,
} from "@shared/validation/BlockValidation";

import { logger } from "../../../server/logger";
import {
  validatePage,
  type ValidatablePageStep,
} from "../../../server/workflows/validation";

vi.mock("../../../server/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ORIGINAL_MODE = process.env.SERVER_FIELD_VALIDATION;

afterEach(() => {
  vi.mocked(logger.warn).mockClear();
  if (ORIGINAL_MODE === undefined) {
    delete process.env.SERVER_FIELD_VALIDATION;
  } else {
    process.env.SERVER_FIELD_VALIDATION = ORIGINAL_MODE;
  }
});

function questionField(
  overrides: Partial<Extract<ListField, { kind: "question" }>> = {}
): ListField {
  return {
    kind: "question",
    id: overrides.id ?? "field-1",
    alias: overrides.alias ?? "name",
    type: "short_text",
    title: overrides.title ?? "Name",
    order: overrides.order ?? 0,
    ...overrides,
  };
}

function nestedListField(config: ListConfig): ListField {
  return {
    kind: "list",
    id: "nested-list",
    alias: "nested",
    title: "Nested",
    order: 0,
    list: config,
  };
}

function item(values: Record<string, unknown>, itemId = "item-1"): ListItem {
  return { itemId, values };
}

function listStep(config: unknown, overrides: Partial<ValidatablePageStep> = {}): ValidatablePageStep {
  return {
    id: "list-1",
    alias: "children",
    type: "list",
    title: "Children",
    config,
    required: false,
    isVirtual: false,
    ...overrides,
  };
}

function buildNested(levels: number): { config: ListConfig; value: ListValue } {
  let config: ListConfig = {
    fields: [questionField({ alias: "leaf", title: "Leaf", required: true })],
  };
  let value: ListValue = { items: [item({ leaf: "" })] };

  for (let level = 1; level < levels; level++) {
    config = { fields: [nestedListField(config)] };
    value = { items: [item({ nested: value })] };
  }

  return { config, value };
}

async function validateList(config: unknown, value: unknown) {
  return validatePage([listStep(config)], { "list-1": value }, ["list-1"]);
}

describe("server-side list validation (LIST-14)", () => {
  describe("enforce mode", () => {
    it("rejects a list submission that violates minItems", async () => {
      process.env.SERVER_FIELD_VALIDATION = "enforce";
      const config: ListConfig = { fields: [questionField()], minItems: 2 };

      const result = await validateList(config, { items: [item({ name: "Ava" })] });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatchObject({
        fieldId: "list-1",
        fieldTitle: "Children",
        path: "children",
        errors: [expect.stringContaining("At least 2")],
      });
    });

    it.each(Array.from({ length: LIST_VALIDATION_MAX_DEPTH }, (_, index) => index + 1))(
      "rejects a missing required field at nesting depth %i",
      async (depth) => {
        process.env.SERVER_FIELD_VALIDATION = "enforce";
        const { config, value } = buildNested(depth);

        const result = await validateList(config, value);

        expect(result.valid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].path).toMatch(/^children\[0\](?:\.nested\[0\])*\.leaf$/);
        expect(result.errors[0].errors).toEqual(["Leaf is required"]);
      }
    );

    it(`rejects values deeper than the exported ${LIST_VALIDATION_MAX_DEPTH}-level cap without throwing`, async () => {
      process.env.SERVER_FIELD_VALIDATION = "enforce";
      const { config, value } = buildNested(LIST_VALIDATION_MAX_DEPTH + 1);

      const resultPromise = validateList(config, value);

      await expect(resultPromise).resolves.toMatchObject({ valid: false });
      const result = await resultPromise;
      expect(result.errors.some(error => error.errors.some(message => message.includes("maximum depth"))))
        .toBe(true);
    });

    it(`rejects values over the exported ${LIST_VALIDATION_MAX_TOTAL_ITEMS}-item cap`, async () => {
      process.env.SERVER_FIELD_VALIDATION = "enforce";
      const config: ListConfig = { fields: [questionField()] };
      const items = Array.from(
        { length: LIST_VALIDATION_MAX_TOTAL_ITEMS + 1 },
        (_, index) => item({ name: `Child ${index}` }, `item-${index}`)
      );

      const result = await validateList(config, { items });

      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.errors.some(message => message.includes("Total item count"))))
        .toBe(true);
    });

    it.each([
      ["absent", undefined],
      ["null", null],
      ["missing fields", {}],
      ["non-array fields", { fields: "bad" }],
      ["malformed nested content", { fields: [null] }],
    ])("returns a validation error for %s config instead of throwing", async (_label, config) => {
      process.env.SERVER_FIELD_VALIDATION = "enforce";

      const resultPromise = validateList(config, { items: [item({})] });

      await expect(resultPromise).resolves.toMatchObject({ valid: false });
      const result = await resultPromise;
      expect(result.errors[0]).toMatchObject({
        fieldId: "list-1",
        path: "children",
        errors: ["Invalid list configuration"],
      });
    });
  });

  it("warns but does not hard-fail list validation while the rollout gate is in warn mode", async () => {
    delete process.env.SERVER_FIELD_VALIDATION;
    const config: ListConfig = { fields: [questionField()], minItems: 1 };

    const result = await validateList(config, { items: [] });

    expect(result).toMatchObject({ valid: true, errors: [], errorCount: 0 });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.warn).mock.calls[0][0]).toMatchObject({
      stepId: "list-1",
      stepType: "list",
    });
  });

  it("leaves non-list validation behavior and error shape unchanged", async () => {
    process.env.SERVER_FIELD_VALIDATION = "enforce";
    const textStep: ValidatablePageStep = {
      id: "text-1",
      type: "short_text",
      title: "Nickname",
      config: { maxLength: 3 },
    };

    const result = await validatePage([textStep], { "text-1": "too long" }, ["text-1"]);

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toEqual({
      fieldId: "text-1",
      fieldTitle: "Nickname",
      errors: expect.any(Array),
    });
  });
});
