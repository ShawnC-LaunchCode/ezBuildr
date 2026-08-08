import { describe, expect, it } from "vitest";

import { decorateMapFindings, summarizeMapFindings } from "@/components/builder/map/mapLintDecoration";
import type { WorkflowLintIssue } from "@shared/types/workflowLint";

function issue(overrides: Partial<WorkflowLintIssue> & { sectionId?: string }): WorkflowLintIssue {
  const { sectionId, ...rest } = overrides;
  return {
    type: "error",
    category: "logic",
    message: "A finding.",
    target: { tab: "map", sectionId },
    ...rest,
  };
}

describe("decorateMapFindings (MAP-6)", () => {
  it("groups findings by their target.sectionId when it matches a node on the map", () => {
    const nodeIds = new Set(["section-a", "section-b"]);
    const errorOnA = issue({ sectionId: "section-a", type: "error", message: "Section A is unreachable." });
    const warningOnB = issue({ sectionId: "section-b", type: "warning", message: "Backward skip." });

    const decoration = decorateMapFindings([errorOnA, warningOnB], nodeIds);

    expect(decoration.bySection.get("section-a")).toEqual([errorOnA]);
    expect(decoration.bySection.get("section-b")).toEqual([warningOnB]);
    expect(decoration.unmatched).toEqual([]);
  });

  it("collects multiple findings for the same node rather than overwriting", () => {
    const nodeIds = new Set(["section-a"]);
    const first = issue({ sectionId: "section-a", message: "First." });
    const second = issue({ sectionId: "section-a", message: "Second." });

    const decoration = decorateMapFindings([first, second], nodeIds);

    expect(decoration.bySection.get("section-a")).toEqual([first, second]);
  });

  it("puts a finding whose target.sectionId matches no node into `unmatched`, not the section map (AC5)", () => {
    const nodeIds = new Set(["section-a"]);
    const ghost = issue({ sectionId: "section-ghost", message: "Stale reference." });

    const decoration = decorateMapFindings([ghost], nodeIds);

    expect(decoration.bySection.size).toBe(0);
    expect(decoration.unmatched).toEqual([ghost]);
  });

  it("excludes findings with no target.sectionId at all — they aren't map-relevant", () => {
    const nodeIds = new Set(["section-a"]);
    const documentFinding = issue({ sectionId: undefined, message: "Missing template." });

    const decoration = decorateMapFindings([documentFinding], nodeIds);

    expect(decoration.bySection.size).toBe(0);
    expect(decoration.unmatched).toEqual([]);
  });

  it("is a pure function — an empty issue list yields an empty decoration", () => {
    const decoration = decorateMapFindings([], new Set(["section-a"]));
    expect(decoration.bySection.size).toBe(0);
    expect(decoration.unmatched).toEqual([]);
  });
});

describe("summarizeMapFindings (MAP-6)", () => {
  it("counts errors and warnings across both matched and unmatched findings", () => {
    const nodeIds = new Set(["section-a"]);
    const decoration = decorateMapFindings(
      [
        issue({ sectionId: "section-a", type: "error" }),
        issue({ sectionId: "section-a", type: "warning" }),
        issue({ sectionId: "section-ghost", type: "warning" }),
      ],
      nodeIds
    );

    expect(summarizeMapFindings(decoration)).toEqual({ errors: 1, warnings: 2, unmatched: 1 });
  });

  it("reports all zeros for a clean workflow", () => {
    const decoration = decorateMapFindings([], new Set());
    expect(summarizeMapFindings(decoration)).toEqual({ errors: 0, warnings: 0, unmatched: 0 });
  });
});
