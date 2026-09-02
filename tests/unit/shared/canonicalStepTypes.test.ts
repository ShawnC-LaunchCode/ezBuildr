import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CANONICAL_STEP_TYPES,
  type CanonicalStepType,
  type StepConfigByType,
  adaptLegacyStep,
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

  describe("STB-19 backward compatibility and validation", () => {

    it("AC9: read-side choice display remains unchanged by conversion", () => {
      const radioMulti = adaptLegacyStep({ type: "radio", config: { display: "radio", allowMultiple: true, options: [] } });
      expect(radioMulti.type).toBe("choice");
      expect((radioMulti.config as any).display).toBe("multiple");

      const multChoice = adaptLegacyStep({ type: "multiple_choice", config: { options: [] } });
      expect(multChoice.type).toBe("choice");
      expect((multChoice.config as any).display).toBe("multiple");
    });

    it("boolean trueLabel regression", () => {
      const boolStep = adaptLegacyStep({ type: "yes_no", config: { yesLabel: "Yep" } });
      expect(boolStep.type).toBe("boolean");
      expect((boolStep.config as any).trueLabel).toBe("Yep");
    });
  });
});
