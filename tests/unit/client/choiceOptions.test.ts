import { describe, it, expect } from "vitest";

import { getLegacyChoiceOptions } from "../../../shared/choiceOptions";

describe("getLegacyChoiceOptions (ICW2-16)", () => {
  it("returns an empty array for a null/missing config", () => {
    expect(getLegacyChoiceOptions(null)).toEqual([]);
    expect(getLegacyChoiceOptions(undefined)).toEqual([]);
    expect(getLegacyChoiceOptions({})).toEqual([]);
  });

  it("maps plain string options to identical value/label (matches runner's stored value)", () => {
    // Mirrors client/src/components/runner/blocks/choice/useChoiceOptions.ts's
    // parseLegacyOptions: a plain string option stores itself as the alias.
    const result = getLegacyChoiceOptions({ options: ["Red", "Blue"] });
    expect(result).toEqual([
      { value: "Red", label: "Red" },
      { value: "Blue", label: "Blue" },
    ]);
  });

  it("resolves object options using alias ?? id ?? label ?? optN, matching ChoiceBlock's stored value", () => {
    const result = getLegacyChoiceOptions({
      options: [
        { id: "opt_1", label: "Option One", alias: "opt_one" },
        { id: "opt_2", label: "Option Two" }, // no alias -> falls back to id
        { label: "Option Three" }, // no alias/id -> falls back to label
      ],
    });

    expect(result).toEqual([
      { value: "opt_one", label: "Option One" },
      { value: "opt_2", label: "Option Two" },
      { value: "Option Three", label: "Option Three" },
    ]);
  });

  it("falls back to a generated optN value when an option has neither alias, id, nor label", () => {
    const result = getLegacyChoiceOptions({ options: [{}] });
    expect(result[0]?.value).toBe("opt0");
  });

  it("returns an empty array when options is not an array (e.g. advanced choice discriminated-union config)", () => {
    expect(getLegacyChoiceOptions({ options: { type: "list", listVariable: "x" } })).toEqual([]);
  });
});
