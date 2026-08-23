import { describe, expect, it } from "vitest";

import {
  assertValidSectionSpans,
  SectionLayoutError,
} from "../../../server/services/sectionSpans";

const sections = [
  { id: "section-a", title: "Applicant" },
  { id: "section-b", title: "Documents" },
];

describe("assertValidSectionSpans", () => {
  it("accepts contiguous Section spans with ungrouped pages between them", () => {
    expect(() => assertValidSectionSpans([
      { id: "page-a1", order: 0, sectionId: "section-a" },
      { id: "page-a2", order: 1, sectionId: "section-a" },
      { id: "ungrouped", order: 2, sectionId: null },
      { id: "page-b1", order: 3, sectionId: "section-b" },
    ], sections)).not.toThrow();
  });

  it("rejects a split span with the offending Section title and status 400", () => {
    let thrown: unknown;
    try {
      assertValidSectionSpans([
        { id: "page-a1", order: 0, sectionId: "section-a" },
        { id: "ungrouped", order: 1, sectionId: null },
        { id: "page-a2", order: 2, sectionId: "section-a" },
        { id: "page-b1", order: 3, sectionId: "section-b" },
      ], sections);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SectionLayoutError);
    expect(thrown).toMatchObject({ statusCode: 400 });
    expect((thrown as Error).message).toContain("Applicant");
  });

  it("rejects an empty Section with its title and a caller-selected 409", () => {
    let thrown: unknown;
    try {
      assertValidSectionSpans([
        { id: "page-a", order: 0, sectionId: "section-a" },
      ], sections, { emptyStatusCode: 409 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SectionLayoutError);
    expect(thrown).toMatchObject({ statusCode: 409 });
    expect((thrown as Error).message).toContain("Documents");
  });

  it("rejects duplicate page order values before span ordering can become nondeterministic", () => {
    expect(() => assertValidSectionSpans([
      { id: "page-a", order: 0, sectionId: "section-a" },
      { id: "page-b", order: 0, sectionId: "section-b" },
    ], sections)).toThrow(/order values must be unique/i);
  });
});
