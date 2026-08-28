// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StepItem } from "@/components/builder/sidebar/StepItem";
import type { ApiStep } from "@/lib/vault-api";

vi.mock("@/lib/vault-hooks", () => ({
  useDeleteStep: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/store/workflow-builder", () => ({
  useWorkflowBuilder: () => ({ selection: null, selectStep: vi.fn() }),
}));

describe("StepItem question presentation", () => {
  it("shows a friendly text-family tile for a legacy long-text sidebar row", () => {
    const step = {
      id: "legacy-long",
      pageId: "page-1",
      type: "long_text",
      title: "Legacy notes",
      required: false,
      visibleIf: null,
    } as unknown as ApiStep;

    render(<StepItem step={step} pageId="page-1" />);

    const icon = screen.getByTitle("Long Text");
    expect(icon).toHaveClass("bg-qtype-text");
    expect(icon).toHaveTextContent("¶");
    expect(screen.queryByTitle("long_text")).not.toBeInTheDocument();
  });
});
