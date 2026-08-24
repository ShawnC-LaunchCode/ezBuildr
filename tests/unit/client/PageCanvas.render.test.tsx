// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PageCanvas } from "@/components/builder/pages/PageCanvas";
import type { ApiPage, ApiSection } from "@/lib/vault-api";

const mocks = vi.hoisted(() => ({
  pages: [] as ApiPage[],
  sections: [] as ApiSection[],
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  KeyboardSensor: class {},
  PointerSensor: class {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  closestCenter: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
}));

vi.mock("@/lib/vault-hooks", () => ({
  usePages: () => ({ data: mocks.pages }),
  useSections: () => ({ data: mocks.sections }),
  useBlocks: () => ({ data: [] }),
  useTransformBlocks: () => ({ data: [] }),
  useWorkflowMode: () => ({ data: { mode: "easy" } }),
  useCreatePageAtEnd: () => ({ createPageAtEnd: vi.fn() }),
  useAllSteps: () => ({}),
}));

vi.mock("@/components/builder/BlockEditorDialog", () => ({
  BlockEditorDialog: () => null,
}));

vi.mock("@/components/builder/pages/PageCanvas.hooks", () => ({
  usePageDragAndDrop: () => ({
    activeDragData: null,
    overId: null,
    landingLabel: null,
    landingSectionId: null,
    pendingEmptySection: null,
    isSubmitting: false,
    handleDragStart: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragCancel: vi.fn(),
    handleDragEnd: vi.fn(),
    cancelPendingMove: vi.fn(),
    confirmPendingMove: vi.fn(),
  }),
}));

vi.mock("@/components/builder/pages/PageCard", () => ({
  PageCard: ({ page }: { page: ApiPage }) => (
    <article data-page-card={page.id}>{page.title}</article>
  ),
}));

vi.mock("@/components/builder/pages/CanvasSection", () => ({
  CanvasSection: ({
    section,
    children,
  }: {
    section: ApiSection;
    children: React.ReactNode;
  }) => <section aria-label={`Section ${section.title}`}>{children}</section>,
}));

vi.mock("@/components/builder/pages/CanvasDropIndicator", () => ({
  CanvasLandingRail: () => null,
  PageDropIndicator: () => null,
}));

vi.mock("@/components/builder/pages/EmptySectionConfirmation", () => ({
  EmptySectionConfirmation: () => null,
}));

function page(id: string, order: number, sectionId: string | null = null): ApiPage {
  return {
    id,
    workflowId: "workflow-1",
    title: id,
    description: null,
    order,
    sectionId,
    createdAt: "2026-08-23T00:00:00.000Z",
  };
}

describe("PageCanvas hierarchy rendering", () => {
  beforeEach(() => {
    mocks.pages = [page("page-a", 0), page("page-b", 1)];
    mocks.sections = [];
  });

  it("preserves the literal direct flat PageCard map when there are zero Sections", () => {
    const { container } = render(<PageCanvas workflowId="workflow-1" />);

    expect(screen.queryByRole("region", { name: /Section/ })).toBeNull();
    expect(container.querySelectorAll("[data-canvas-page]")).toHaveLength(0);
    const cards = container.querySelectorAll("[data-page-card]");
    expect(cards).toHaveLength(2);
    expect(cards[0].parentElement).toHaveClass("space-y-6");
  });

  it("renders grouped pages under the filing-rail Section canvas", () => {
    mocks.sections = [{
      id: "assets",
      workflowId: "workflow-1",
      title: "Assets",
      description: null,
      createdAt: "2026-08-23T00:00:00.000Z",
    }];
    mocks.pages = [page("page-a", 0, "assets"), page("page-b", 1, "assets")];
    render(<PageCanvas workflowId="workflow-1" />);

    const section = screen.getByRole("region", { name: "Section Assets" });
    expect(section).toContainElement(screen.getByText("page-a"));
    expect(section).toContainElement(screen.getByText("page-b"));
  });
});
