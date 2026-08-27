import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CANONICAL_STEP_TYPES,
  type CanonicalStepType,
  type StepConfigByType,
} from "../../../shared/types/stepConfigs";
import { getRunnerStepTypeStatus } from "../../../shared/types/runnerStepTypes";

describe("canonical step types", () => {
  it("contains exactly the 18 canonical stored identities", () => {
    expect(CANONICAL_STEP_TYPES).toEqual([
      "text",
      "boolean",
      "phone",
      "date_time",
      "choice",
      "email",
      "number",
      "scale",
      "website",
      "address",
      "multi_field",
      "display",
      "file_upload",
      "list",
      "js_question",
      "computed",
      "final_documents",
      "signature_block",
    ]);
    expect(new Set(CANONICAL_STEP_TYPES).size).toBe(18);
  });

  it("has one config decision for every canonical identity", () => {
    expectTypeOf<keyof StepConfigByType>().toEqualTypeOf<CanonicalStepType>();
  });

  it("classifies every canonical identity at runtime", () => {
    for (const type of CANONICAL_STEP_TYPES) {
      expect(getRunnerStepTypeStatus(type), `${type} has no runner classification`).not.toBe(
        "unknown",
      );
    }
  });
});
