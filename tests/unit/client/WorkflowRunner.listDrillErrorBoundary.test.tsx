// @vitest-environment jsdom
/**
 * LIST2-5 AC5 — `ListDrillEditor` was the one step renderer in the runner not
 * wrapped in `BlockErrorBoundary`, so anything it threw took down the whole
 * page body instead of just the block. `QuestionCardContent` in
 * WorkflowRunner.tsx now wraps its render site.
 *
 * The fault is injected by mocking `ListDrillEditor` to throw, rather than by
 * feeding it a malformed config. As delivered, this test used a config with no
 * `fields` — but the reviewer's AC4 fix (`normalizeListConfig`, from LIST2-3)
 * makes that case degrade to an empty list instead of throwing, so it no
 * longer reaches the boundary. AC4 and AC5 are separate guarantees: AC4 says
 * *this known bad input* does not crash, AC5 says *any* crash is contained.
 * Injecting the fault is what keeps AC5 honest now that AC4 removed the only
 * convenient natural trigger — otherwise deleting the `BlockErrorBoundary`
 * wrap would leave every test still green.
 */
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListDrillProvider, useListDrill } from "@/components/runner/list/ListDrillContext";
import { QuestionCardContent } from "@/pages/WorkflowRunner";
import type { ApiStep } from "@/lib/vault-api";

vi.mock("@/components/runner/list/ListDrillEditor", () => ({
  ListDrillEditor: () => {
    throw new Error("boom from ListDrillEditor");
  },
}));

function makeListStep(): ApiStep {
  return {
    id: "step-list-1",
    workflowId: "wf-1",
    pageId: "page-1",
    type: "list",
    title: "Team",
    description: null,
    required: false,
    alias: "team",
    order: 1,
    isVirtual: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    config: { fields: [] } as unknown as Record<string, unknown>,
  } as unknown as ApiStep;
}

function Harness() {
  const { drill, enterList } = useListDrill();
  const step = makeListStep();

  useEffect(() => {
    if (!drill) {
      enterList(step.id, { fieldAlias: null, itemId: "item-1", label: "Item 1" });
    }
  }, [drill, enterList, step.id]);

  return (
    <QuestionCardContent
      currentPage={{ id: "page-1", workflowId: "wf-1", title: "Page", description: null, order: 0, createdAt: "2026-08-01T00:00:00.000Z" }}
      visiblePageSteps={[step]}
      allSteps={[step]}
      effectiveValues={{ [step.id]: { items: [{ itemId: "item-1", values: {} }] } }}
      handleUpdateValue={() => undefined}
      fieldErrors={{}}
      effectiveLogicRules={[]}
      errors={[]}
      currentPageIndex={0}
      isLastPage={false}
      handlePrev={async () => undefined}
      handleNext={async () => undefined}
    />
  );
}

describe("QuestionCardContent — LIST2-5 AC5 BlockErrorBoundary wrap", () => {
  afterEach(() => {
    cleanup();
  });

  it("contains a ListDrillEditor render crash instead of taking down the page", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    expect(() =>
      render(
        <QueryClientProvider client={queryClient}>
          <ListDrillProvider>
            <Harness />
          </ListDrillProvider>
        </QueryClientProvider>
      )
    ).not.toThrow();

    expect(screen.getByText("Component Error")).toBeDefined();

    consoleError.mockRestore();
  });
});
