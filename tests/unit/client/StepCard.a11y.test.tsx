// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { StepCard } from "@/components/builder/cards/StepCard";
import type { ApiStep } from "@/lib/vault-api";

/**
 * O-5 regression: the step card's expand/collapse toggle is icon-only. Without
 * an explicit name it was announced as an unlabelled button and could not be
 * found by any name-based query — which is how it was discovered, by blocking
 * an accessibility-driven walkthrough of the builder.
 *
 * These pin the two properties assistive tech needs: a name that says what the
 * control does and which question it belongs to, and `aria-expanded` conveying
 * open state that the chevron otherwise shows only visually.
 */

vi.mock("@/components/collab/CollaborationContext", () => ({
  useCollaboration: () => ({ updateActiveBlock: vi.fn(), user: { id: "u1" } }),
  useBlockCollaborators: () => ({ lockedBy: null, isLocked: false }),
}));

vi.mock("@/lib/vault-hooks", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useUpdateStep: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteStep: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDuplicateStep: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useWorkflowMode: () => ({ data: { mode: "easy" } }),
  };
});

const step = {
  id: "step-1",
  type: "short_text",
  title: "What is your name?",
  order: 1,
  pageId: "page-1",
} as unknown as ApiStep;

function renderCard(isExpanded: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StepCard
        step={step}
        pageId="page-1"
        workflowId="wf-1"
        isExpanded={isExpanded}
        onToggleExpand={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe("StepCard expand toggle accessibility (O-5)", () => {
  it("shows a friendly text-family tile for a legacy text row", () => {
    renderCard(false);
    const icon = screen.getByTitle("Short Text");
    expect(icon).toHaveClass("bg-qtype-text");
    expect(icon).toHaveTextContent("T");
    expect(screen.queryByTitle("short_text")).not.toBeInTheDocument();
  });

  it("exposes a named toggle that says which question it belongs to", () => {
    renderCard(false);
    const toggle = screen.getByRole("button", { name: /expand settings for what is your name\?/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("reports the expanded state and flips the label when open", () => {
    renderCard(true);
    const toggle = screen.getByRole("button", { name: /collapse settings for what is your name\?/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
