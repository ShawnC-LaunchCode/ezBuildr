import { describe, expect, it } from "vitest";

import { decorateMapFindings, summarizeMapFindings } from "@/components/builder/map/mapLintDecoration";
import type { WorkflowLintIssue } from "@shared/types/workflowLint";

function issue(overrides: Partial<WorkflowLintIssue> & { pageId?: string }): WorkflowLintIssue {
  const { pageId, ...rest } = overrides;
  return {
    type: "error",
    category: "logic",
    message: "A finding.",
    target: { tab: "map", pageId },
    ...rest,
  };
}

describe("decorateMapFindings (MAP-6)", () => {
  it("groups findings by their target.pageId when it matches a node on the map", () => {
    const nodeIds = new Set(["page-a", "page-b"]);
    const errorOnA = issue({ pageId: "page-a", type: "error", message: "Page A is unreachable." });
    const warningOnB = issue({ pageId: "page-b", type: "warning", message: "Backward skip." });

    const decoration = decorateMapFindings([errorOnA, warningOnB], nodeIds);

    expect(decoration.byPage.get("page-a")).toEqual([errorOnA]);
    expect(decoration.byPage.get("page-b")).toEqual([warningOnB]);
    expect(decoration.unmatched).toEqual([]);
  });

  it("collects multiple findings for the same node rather than overwriting", () => {
    const nodeIds = new Set(["page-a"]);
    const first = issue({ pageId: "page-a", message: "First." });
    const second = issue({ pageId: "page-a", message: "Second." });

    const decoration = decorateMapFindings([first, second], nodeIds);

    expect(decoration.byPage.get("page-a")).toEqual([first, second]);
  });

  it("puts a finding whose target.pageId matches no node into `unmatched`, not the page map (AC5)", () => {
    const nodeIds = new Set(["page-a"]);
    const ghost = issue({ pageId: "page-ghost", message: "Stale reference." });

    const decoration = decorateMapFindings([ghost], nodeIds);

    expect(decoration.byPage.size).toBe(0);
    expect(decoration.unmatched).toEqual([ghost]);
  });

  it("excludes findings with no target.pageId at all — they aren't map-relevant", () => {
    const nodeIds = new Set(["page-a"]);
    const documentFinding = issue({ pageId: undefined, message: "Missing template." });

    const decoration = decorateMapFindings([documentFinding], nodeIds);

    expect(decoration.byPage.size).toBe(0);
    expect(decoration.unmatched).toEqual([]);
  });

  it("is a pure function — an empty issue list yields an empty decoration", () => {
    const decoration = decorateMapFindings([], new Set(["page-a"]));
    expect(decoration.byPage.size).toBe(0);
    expect(decoration.unmatched).toEqual([]);
  });
});

describe("summarizeMapFindings (MAP-6)", () => {
  it("counts errors and warnings across both matched and unmatched findings", () => {
    const nodeIds = new Set(["page-a"]);
    const decoration = decorateMapFindings(
      [
        issue({ pageId: "page-a", type: "error" }),
        issue({ pageId: "page-a", type: "warning" }),
        issue({ pageId: "page-ghost", type: "warning" }),
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
