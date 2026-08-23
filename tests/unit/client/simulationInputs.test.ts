import { describe, expect, it } from "vitest";

import {
  buildSimulationFields,
  buildStepAliasResolver,
  getReferencedStepIds,
  getReferencedSteps,
  toConditionStepType,
} from "@/components/builder/map/simulationInputs";
import type { ApiStep } from "@/lib/vault-api";

const createdAt = "2026-08-08T00:00:00.000Z";

function step(overrides: Partial<ApiStep> & Pick<ApiStep, "id" | "pageId" | "type" | "title">): ApiStep {
  return {
    id: overrides.id,
    workflowId: "wf-1",
    pageId: overrides.pageId,
    type: overrides.type,
    title: overrides.title,
    description: null,
    required: false,
    alias: overrides.alias ?? null,
    order: overrides.order ?? 0,
    isVirtual: false,
    config: overrides.config ?? null,
    createdAt,
    visibleIf: overrides.visibleIf,
  };
}

function isTrue(variable: string): unknown {
  return {
    type: "group",
    operator: "AND",
    conditions: [{ type: "condition", variable, operator: "is_true", value: true, valueType: "constant" }],
  };
}

describe("getReferencedStepIds / getReferencedSteps (MAP-8 AC1)", () => {
  it("collects references from a page's visibleIf, a step's visibleIf, and a rule's when", () => {
    const pages = [{ visibleIf: isTrue("from-page") }];
    const steps = [
      step({ id: "from-page", pageId: "page-1", type: "yes_no", title: "Trigger A" }),
      step({ id: "from-step", pageId: "page-1", type: "yes_no", title: "Trigger B" }),
      step({ id: "from-rule", pageId: "page-1", type: "yes_no", title: "Trigger C" }),
      step({ id: "dependent", pageId: "page-1", type: "short_text", title: "Depends on B", visibleIf: isTrue("from-step") }),
    ];
    const rules = [{ when: isTrue("from-rule") }];

    const ids = getReferencedStepIds(pages, steps, rules);
    expect(ids).toEqual(new Set(["from-page", "from-step", "from-rule"]));
  });

  it("resolves a reference by alias to the step's real id — never keeps the alias itself", () => {
    const steps = [step({ id: "step-uuid", pageId: "page-1", type: "yes_no", title: "Trigger", alias: "agree" })];
    const rules = [{ when: isTrue("agree") }];

    const ids = getReferencedStepIds([], steps, rules);
    expect(ids).toEqual(new Set(["step-uuid"]));
  });

  it("drops a reference that resolves to no known step (dangling) rather than inventing a field for it", () => {
    const steps = [step({ id: "step-a", pageId: "page-1", type: "yes_no", title: "A" })];
    const rules = [{ when: isTrue("step-ghost") }];

    const ids = getReferencedStepIds([], steps, rules);
    expect(ids.size).toBe(0);
  });

  it("returns only referenced steps, not every step in the workflow (AC1)", () => {
    const steps = [
      step({ id: "referenced", pageId: "page-1", type: "yes_no", title: "Referenced" }),
      step({ id: "unreferenced", pageId: "page-1", type: "short_text", title: "Unreferenced" }),
    ];
    const rules = [{ when: isTrue("referenced") }];

    const result = getReferencedSteps([], steps, rules);
    expect(result.map((s) => s.id)).toEqual(["referenced"]);
  });

  it("preserves the original step order rather than the order references were discovered in", () => {
    const steps = [
      step({ id: "b", pageId: "page-1", type: "yes_no", title: "B" }),
      step({ id: "a", pageId: "page-1", type: "yes_no", title: "A" }),
    ];
    // Reference "a" first in the rule array, but "b" comes first in `steps`.
    const rules = [{ when: isTrue("a") }, { when: isTrue("b") }];

    const result = getReferencedSteps([], steps, rules);
    expect(result.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("buildStepAliasResolver (AC2)", () => {
  it("resolves a variable name to the step whose alias matches it — the exact usePageVisibility.ts construction", () => {
    const steps = [
      { id: "step-1", alias: "has_pet" },
      { id: "step-2", alias: null },
    ];
    const resolve = buildStepAliasResolver(steps);

    expect(resolve("has_pet")).toBe("step-1");
    expect(resolve("no_such_alias")).toBeUndefined();
  });
});

describe("toConditionStepType", () => {
  it("maps known aliases onto their ConditionSupportedStepType", () => {
    expect(toConditionStepType("yes_no")).toBe("yes_no");
    expect(toConditionStepType("boolean")).toBe("yes_no");
    expect(toConditionStepType("true_false")).toBe("yes_no");
    expect(toConditionStepType("date")).toBe("date_time");
    expect(toConditionStepType("datetime")).toBe("date_time");
    expect(toConditionStepType("choice")).toBe("multiple_choice");
    expect(toConditionStepType("radio")).toBe("radio");
  });

  it("falls back to short_text for any type the condition system doesn't have a dedicated operator list for", () => {
    expect(toConditionStepType("currency")).toBe("short_text");
    expect(toConditionStepType("scale")).toBe("short_text");
    expect(toConditionStepType("signature_block")).toBe("short_text");
    expect(toConditionStepType("totally-unknown-type")).toBe("short_text");
  });
});

describe("buildSimulationFields (AC7 — type-aware value entry, no new input component)", () => {
  const pageTitleById = new Map([["page-1", "Page One"]]);

  it("gives a yes_no step a two-choice picker even though none of its real operators need a value", () => {
    const [field] = buildSimulationFields(
      [step({ id: "s1", pageId: "page-1", type: "yes_no", title: "Agree?" })],
      pageTitleById
    );

    expect(field.operatorConfig.needsValue).toBe(true);
    expect(field.operatorConfig.valueType).toBe("choices");
    expect(field.variable.choices).toEqual([
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ]);
  });

  it("gives a file_upload step a has-a-file / no-file picker", () => {
    const [field] = buildSimulationFields(
      [step({ id: "s1", pageId: "page-1", type: "file_upload", title: "Upload" })],
      pageTitleById
    );

    expect(field.operatorConfig.valueType).toBe("choices");
    expect(field.variable.choices).toEqual([
      { value: "provided", label: "Has a file" },
      { value: "", label: "No file" },
    ]);
  });

  it("gives a radio step real choices pulled from its legacy config, via the shared choiceOptions helper", () => {
    const [field] = buildSimulationFields(
      [
        step({
          id: "s1",
          pageId: "page-1",
          type: "radio",
          title: "Pick one",
          config: { options: ["Red", "Blue"] },
        }),
      ],
      pageTitleById
    );

    expect(field.operatorConfig.valueType).toBe("choices");
    expect(field.variable.choices).toEqual([
      { value: "Red", label: "Red" },
      { value: "Blue", label: "Blue" },
    ]);
  });

  it("gives a short_text step a plain single-value text operator (never needsTwoValues)", () => {
    const [field] = buildSimulationFields(
      [step({ id: "s1", pageId: "page-1", type: "short_text", title: "Name" })],
      pageTitleById
    );

    expect(field.operatorConfig.needsValue).toBe(true);
    expect(field.operatorConfig.valueType).toBe("text");
    expect(field.operatorConfig.needsTwoValues).toBeFalsy();
  });

  it("gives a date_time step a single date value operator, not the two-value between/diff operators", () => {
    const [field] = buildSimulationFields(
      [step({ id: "s1", pageId: "page-1", type: "date_time", title: "When" })],
      pageTitleById
    );

    expect(field.operatorConfig.valueType).toBe("date");
    expect(field.operatorConfig.needsTwoValues).toBeFalsy();
  });

  it("labels the field by alias when one exists, falling back to the step title, and fills in the page title", () => {
    const [field] = buildSimulationFields(
      [step({ id: "s1", pageId: "page-1", type: "short_text", title: "Full Name", alias: "full_name" })],
      pageTitleById
    );

    expect(field.variable.label).toBe("full_name");
    expect(field.variable.pageTitle).toBe("Page One");
    expect(field.variable.id).toBe("s1");
  });
});
