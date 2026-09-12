// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasSection } from "@/components/builder/pages/CanvasSection";
import type { ApiPage, ApiSection } from "@/lib/vault-api";

const mocks = vi.hoisted(() => ({
  keyDown: vi.fn(),
  useSortable: vi.fn(),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  verticalListSortingStrategy: {},
  useSortable: mocks.useSortable,
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "translate3d(0, 0, 0)" } },
}));

const section: ApiSection = {
  id: "assets",
  workflowId: "workflow-1",
  title: "Assets",
  description: null,
  createdAt: "2026-08-23T00:00:00.000Z",
};

const page: ApiPage = {
  id: "page-1",
  workflowId: "workflow-1",
  title: "Property",
  description: null,
  order: 0,
  sectionId: "assets",
  createdAt: "2026-08-23T00:00:00.000Z",
};

describe("CanvasSection keyboard drag affordance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    mocks.useSortable.mockReturnValue({
      attributes: { tabIndex: 0 },
      listeners: { onKeyDown: mocks.keyDown },
      setNodeRef: vi.fn(),
      transform: null,
      transition: "transform 200ms ease",
      isDragging: false,
    });
  });

  it("uses a namespaced typed sortable and exposes a focusable named handle", () => {
    render(
      <CanvasSection section={section} pages={[page]} isLandingTarget={false}>
        <div>Property page</div>
      </CanvasSection>,
    );

    expect(mocks.useSortable).toHaveBeenCalledWith({
      id: "canvas-section:assets",
      data: { kind: "section", sectionId: "assets", title: "Assets" },
    });
    const handle = screen.getByRole("button", { name: "Reorder Section Assets" });
    expect(handle).toHaveAttribute("tabindex", "0");
    handle.focus();
    expect(handle).toHaveFocus();
    fireEvent.keyDown(handle, { key: " " });
    expect(mocks.keyDown).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: "Section Assets" }))
      .toHaveStyle({ transition: "none" });
  });
});
