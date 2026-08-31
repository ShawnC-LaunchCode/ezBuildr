import { describe, expect, it } from "vitest";

import {
  getRunnerStepTypeStatus,
} from "../../../client/src/components/runner/blocks/stepTypeRouting";
import { stepTypeEnum } from "../../../shared/schema/workflow";
import { OPERATORS_BY_STEP_TYPE } from "../../../shared/types/conditions";
import {
  adaptLegacyStep,
  CANONICAL_STEP_TYPES,
  LIST_FIELD_QUESTION_TYPES,
} from "../../../shared/types/stepConfigs";
import {
  LEGACY_RENDERED_STEP_TYPES,
  PERSISTED_ROW_COMPATIBILITY_MAP,
  RUNNER_HIDDEN_STEP_TYPES,
  RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES,
  RUNNER_RENDERED_STEP_TYPES,
} from "../../../shared/types/runnerStepTypes";

describe("runner step type routing", () => {
  it("classifies every persisted step type", () => {
    const unknownTypes = stepTypeEnum.enumValues.filter(
      (stepType) => getRunnerStepTypeStatus(stepType) === "unknown"
    );

    expect(unknownTypes).toEqual([]);
  });

  it("adapts every persisted legacy name to its canonical rendered runner type", () => {
    const expectedCompatibilityMap = {
      short_text: "text",
      long_text: "text",
      yes_no: "boolean",
      true_false: "boolean",
      multiple_choice: "choice",
      radio: "choice",
      date: "date_time",
      time: "date_time",
      datetime: "date_time",
      datetime_unified: "date_time",
      phone_advanced: "phone",
      email_advanced: "email",
      number_advanced: "number",
      currency: "number",
      scale_advanced: "scale",
      website_advanced: "website",
      address_advanced: "address",
      display_advanced: "display",
      final: "final_documents",
      signature: "signature_block",
    };

    expect(PERSISTED_ROW_COMPATIBILITY_MAP).toEqual(expectedCompatibilityMap);
    expect(LEGACY_RENDERED_STEP_TYPES).toEqual(Object.keys(expectedCompatibilityMap));

    for (const [legacyType, canonicalType] of Object.entries(PERSISTED_ROW_COMPATIBILITY_MAP)) {
      const adapted = adaptLegacyStep({ type: legacyType, config: {} });

      expect(adapted.type, `${legacyType} did not adapt`).toBe(canonicalType);
      expect(getRunnerStepTypeStatus(legacyType), `${legacyType} stopped rendering`).toBe(
        "rendered",
      );
    }
  });

  it("keeps persisted aliases out of every request-facing type registry", () => {
    const persistedAliases = new Set(Object.keys(PERSISTED_ROW_COMPATIBILITY_MAP));
    const requestFacingRegistries: Record<string, readonly string[]> = {
      canonical: CANONICAL_STEP_TYPES,
      rendered: RUNNER_RENDERED_STEP_TYPES,
      hidden: RUNNER_HIDDEN_STEP_TYPES,
      unsupported: RUNNER_INTENTIONALLY_UNSUPPORTED_STEP_TYPES,
      listFields: LIST_FIELD_QUESTION_TYPES,
      conditions: Object.keys(OPERATORS_BY_STEP_TYPE),
    };

    for (const [registryName, stepTypes] of Object.entries(requestFacingRegistries)) {
      const leakedAliases = stepTypes.filter((stepType) => persistedAliases.has(stepType));
      expect(leakedAliases, `${registryName} contains request-facing aliases`).toEqual([]);
    }
  });

  it("renders file uploads while keeping execution-only and retired types explicit", () => {
    expect(getRunnerStepTypeStatus("computed")).toBe("hidden");
    expect(getRunnerStepTypeStatus("js_question")).toBe("hidden");
    expect(getRunnerStepTypeStatus("file_upload")).toBe("rendered");
    // Retired in LIST-13 — they are no longer step types at all, so they
    // classify as "unknown" rather than "unsupported".
    expect(getRunnerStepTypeStatus("loop_group")).toBe("unknown");
    expect(getRunnerStepTypeStatus("repeater")).toBe("unknown");
  });

  it("renders 'list' now that the runner has a drill-in control for it (LIST-8)", () => {
    expect(getRunnerStepTypeStatus("list")).toBe("rendered");
  });
});
