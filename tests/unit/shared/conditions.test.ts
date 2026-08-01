import { describe, it, expect } from "vitest";

import {
  OPERATORS_BY_STEP_TYPE,
  getOperatorsForStepType,
  getOperatorConfig,
} from "@shared/types/conditions";

describe("conditions - date_time operators (ICW2-16)", () => {
  it("exposes the dedicated date comparison operators the engine implements", () => {
    const operatorValues = getOperatorsForStepType("date_time").map((op) => op.value);

    expect(operatorValues).toContain("before");
    expect(operatorValues).toContain("after");
    expect(operatorValues).toContain("on_or_before");
    expect(operatorValues).toContain("on_or_after");
    expect(operatorValues).toContain("diff_days");
    expect(operatorValues).toContain("diff_weeks");
    expect(operatorValues).toContain("diff_months");
    expect(operatorValues).toContain("diff_years");
  });

  it("no longer lists the generic numeric operators for date_time (superseded by dedicated date ops)", () => {
    const operatorValues = getOperatorsForStepType("date_time").map((op) => op.value);

    expect(operatorValues).not.toContain("greater_than");
    expect(operatorValues).not.toContain("less_than");
    expect(operatorValues).not.toContain("greater_or_equal");
    expect(operatorValues).not.toContain("less_or_equal");
  });

  it("gives each diff_* operator a date value and a number value2", () => {
    for (const op of ["diff_days", "diff_weeks", "diff_months", "diff_years"] as const) {
      const config = OPERATORS_BY_STEP_TYPE.date_time.find((c) => c.value === op);
      expect(config).toBeDefined();
      expect(config?.needsTwoValues).toBe(true);
      expect(config?.valueType).toBe("date");
      expect(config?.value2Type).toBe("number");
    }
  });

  it("resolves legacy greater_than/less_than/etc conditions saved before the dedicated operators existed", () => {
    // A condition persisted before this ticket may still carry the old
    // generic-numeric operator id; the UI must keep resolving a sensible
    // label/value-input config for it (AC3: no regression on existing conditions).
    const legacyAfter = getOperatorConfig("date_time", "greater_than");
    const legacyBefore = getOperatorConfig("date_time", "less_than");
    const legacyOnOrAfter = getOperatorConfig("date_time", "greater_or_equal");
    const legacyOnOrBefore = getOperatorConfig("date_time", "less_or_equal");

    expect(legacyAfter?.value).toBe("after");
    expect(legacyAfter?.label).toBe("is after");
    expect(legacyBefore?.value).toBe("before");
    expect(legacyBefore?.label).toBe("is before");
    expect(legacyOnOrAfter?.value).toBe("on_or_after");
    expect(legacyOnOrBefore?.value).toBe("on_or_before");
  });

  it("still resolves the dedicated operators directly by their own value", () => {
    expect(getOperatorConfig("date_time", "after")?.value).toBe("after");
    expect(getOperatorConfig("date_time", "diff_days")?.value).toBe("diff_days");
  });

  it("returns undefined for an operator with no config and no legacy mapping", () => {
    expect(getOperatorConfig("date_time", "includes")).toBeUndefined();
  });
});
