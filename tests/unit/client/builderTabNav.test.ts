import { describe, expect, it } from "vitest";

import { isBuilderTab } from "../../../client/src/components/builder/layout/BuilderTabNav";

describe("isBuilderTab", () => {
  it("accepts every current builder tab", () => {
    for (const tab of ["sections", "templates", "data-sources", "review", "snapshots", "settings"]) {
      expect(isBuilderTab(tab)).toBe(true);
    }
  });

  it("rejects the removed assignment tab and unknown values", () => {
    expect(isBuilderTab("assignment")).toBe(false);
    expect(isBuilderTab("unknown")).toBe(false);
    expect(isBuilderTab(null)).toBe(false);
  });
});
