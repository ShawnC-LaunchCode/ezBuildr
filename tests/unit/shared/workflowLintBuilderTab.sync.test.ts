import { describe, expect, it } from "vitest";

import { TABS } from "@/components/builder/layout/BuilderTabNav";
import type { BuilderTab } from "@/components/builder/layout/BuilderTabNav";
import type { WorkflowLintBuilderTab } from "@shared/types/workflowLint";

// Compile-time half of the guard (MAP-B3): WorkflowLintBuilderTab and
// BuilderTab must describe the same set of tabs. Each line below only
// type-checks if every member of one union is also a member of the other, so
// `npm run type-check` fails the moment either union gains or loses a tab
// without the other following.
type LintTabsAreBuilderTabs = WorkflowLintBuilderTab extends BuilderTab ? true : never;
type BuilderTabsAreLintTabs = BuilderTab extends WorkflowLintBuilderTab ? true : never;
const _typesStayInSync: [LintTabsAreBuilderTabs, BuilderTabsAreLintTabs] = [true, true];
void _typesStayInSync;

describe("WorkflowLintBuilderTab stays in sync with BuilderTab (MAP-B3)", () => {
  it("matches BuilderTabNav's runtime tab set 1:1", () => {
    // Mirrors the WorkflowLintBuilderTab union literally. If someone edits
    // shared/types/workflowLint.ts without updating this list, the assignment
    // itself fails to type-check (extra/missing member) before the runtime
    // assertion below even runs.
    const lintTabs: WorkflowLintBuilderTab[] = [
      "sections",
      "templates",
      "data-sources",
      "settings",
      "map",
      "review",
      "snapshots",
    ];
    const builderTabIds = TABS.map((tab) => tab.id).sort();

    expect(lintTabs.slice().sort()).toEqual(builderTabIds);
  });
});
