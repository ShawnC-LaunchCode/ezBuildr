import { describe, expect, it } from "vitest";

import {
  getRunnerStepTypeStatus,
  normalizeRunnerStepType,
} from "../../../client/src/components/runner/blocks/stepTypeRouting";
import { stepTypeEnum } from "../../../shared/schema/workflow";

describe("runner step type routing", () => {
  it("classifies every persisted step type", () => {
    const unknownTypes = stepTypeEnum.enumValues.filter(
      (stepType) => getRunnerStepTypeStatus(stepType) === "unknown"
    );

    expect(unknownTypes).toEqual([]);
  });

  it("normalizes advanced and legacy aliases to rendered runner types", () => {
    expect(normalizeRunnerStepType("datetime")).toBe("date_time");
    expect(normalizeRunnerStepType("datetime_unified")).toBe("date_time");
    expect(normalizeRunnerStepType("phone_advanced")).toBe("phone");
    expect(normalizeRunnerStepType("display_advanced")).toBe("display");
    expect(normalizeRunnerStepType("final")).toBe("final_documents");
    expect(normalizeRunnerStepType("multiple_choice")).toBe("choice");
  });

  it("keeps execution-only and out-of-scope types explicit", () => {
    expect(getRunnerStepTypeStatus("computed")).toBe("hidden");
    expect(getRunnerStepTypeStatus("js_question")).toBe("hidden");
    expect(getRunnerStepTypeStatus("file_upload")).toBe("unsupported");
    expect(getRunnerStepTypeStatus("loop_group")).toBe("unsupported");
    expect(getRunnerStepTypeStatus("repeater")).toBe("unsupported");
  });
});
