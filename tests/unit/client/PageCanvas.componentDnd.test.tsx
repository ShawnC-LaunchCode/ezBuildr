// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PageCanvas } from "@/components/builder/pages/PageCanvas";
import { FetchApiError, type ApiPage, type ApiSection } from "@/lib/vault-api";

import type {
  DndContextProps,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";

const mocks = vi.hoisted(() => ({
  dndProps: null as DndContextProps | null,
  pages: [] as ApiPage[],
  sections: [] as ApiSection[],
  reorderPages: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: (props: DndContextProps) => {
    mocks.dndProps = props;
    return <div data-dnd-context="true">{props.children}</div>;
  },
  KeyboardSensor: class {},
  PointerSensor: class {},
  closestCenter: vi.fn(() => []),
  useDroppable: () => ({ isOver: false, setNodeRef: vi.fn() }),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  arrayMove: (items: unknown[], from: number, to: number) => {
    const copy = [...items];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
  },
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/lib/vault-hooks", () => ({
  usePages: () => ({ data: mocks.pages }),
  useSections: () => ({ data: mocks.sections }),
  useBlocks: () => ({ data: [] }),
  useTransformBlocks: () => ({ data: [] }),
  useWorkflowMode: () => ({ data: { mode: "easy" } }),
  useCreatePageAtEnd: () => ({ createPageAtEnd: vi.fn() }),
  useAllSteps: () => ({}),
  useReorderPages: () => ({ mutateAsync: mocks.reorderPages, isPending: false }),
  useReorderSteps: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useUpdateStep: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/components/builder/BlockEditorDialog", () => ({
  BlockEditorDialog: () => null,
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

function page(id: string, order: number, sectionId: string | null): ApiPage {
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

const assets: ApiSection = {
  id: "assets",
  workflowId: "workflow-1",
  title: "Assets",
  description: null,
  createdAt: "2026-08-23T00:00:00.000Z",
};

function dragStart(id: string, data: object): DragStartEvent {
  return { active: { id, data: { current: data } } } as DragStartEvent;
}

function dragOver(
  activeId: string,
  activeData: object,
  overId: string,
  overData: object,
): DragOverEvent {
  return {
    active: { id: activeId, data: { current: activeData } },
    over: { id: overId, data: { current: overData } },
  } as DragOverEvent;
}

function dragEnd(
  activeId: string,
  activeData: object,
  overId: string,
  overData: object,
): DragEndEvent {
  return dragOver(activeId, activeData, overId, overData) as DragEndEvent;
}

describe("PageCanvas rendered DnD flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dndProps = null;
    mocks.sections = [assets];
    mocks.pages = [page("asset-a", 0, "assets"), page("contact", 1, null)];
    mocks.reorderPages.mockResolvedValue({ affectedSkipRules: [] });
  });

  it("renders a named pre-drop indicator and matching aria-live status", () => {
    const { container } = render(<PageCanvas workflowId="workflow-1" />);
    const activeData = { kind: "page", pageId: "contact", sectionId: null };
    const overData = { kind: "page", pageId: "asset-a", sectionId: "assets" };

    act(() => mocks.dndProps?.onDragStart?.(dragStart("contact", activeData)));
    act(() => mocks.dndProps?.onDragOver?.(
      dragOver("contact", activeData, "asset-a", overData),
    ));

    const label = 'Land in Section “Assets” near “asset-a”';
    expect(screen.getByRole("status")).toHaveTextContent(label);
    expect(container.querySelector("[data-page-drop-indicator]"))
      .toHaveTextContent(label);
  });

  it("wires named 409 cancellation and exact confirmed atomic retry through the dialog", async () => {
    const user = userEvent.setup();
    mocks.reorderPages
      .mockRejectedValueOnce(new FetchApiError('Section "Assets" cannot be empty', 409))
      .mockRejectedValueOnce(new FetchApiError('Section "Assets" cannot be empty', 409))
      .mockResolvedValueOnce({ affectedSkipRules: [] });
    render(<PageCanvas workflowId="workflow-1" />);
    const activeData = { kind: "page", pageId: "asset-a", sectionId: "assets" };
    const landingData = {
      kind: "landing",
      insertIndex: 2,
      sectionId: null,
      label: "Land as an ungrouped page at the end",
    };

    act(() => mocks.dndProps?.onDragEnd?.(
      dragEnd("asset-a", activeData, "canvas-landing:2", landingData),
    ));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Assets");
    await user.click(screen.getByRole("button", { name: "Keep Section" }));
    expect(mocks.reorderPages).toHaveBeenCalledTimes(1);

    act(() => mocks.dndProps?.onDragEnd?.(
      dragEnd("asset-a", activeData, "canvas-landing:2", landingData),
    ));
    await screen.findByRole("alertdialog");
    const rejectedPages = mocks.reorderPages.mock.calls[1][0].pages;
    await user.click(screen.getByRole("button", {
      name: "Move page and delete Section",
    }));

    await waitFor(() => expect(mocks.reorderPages).toHaveBeenCalledTimes(3));
    expect(mocks.reorderPages.mock.calls[2][0]).toEqual({
      workflowId: "workflow-1",
      pages: rejectedPages,
      deleteEmptySectionIds: ["assets"],
    });
  });

  it("keeps PageCards as direct children of the flat list with zero Sections", () => {
    mocks.sections = [];
    mocks.pages = [page("page-a", 0, null), page("page-b", 1, null)];
    const { container } = render(<PageCanvas workflowId="workflow-1" />);

    expect(container.querySelectorAll("[data-canvas-page]")).toHaveLength(0);
    const cards = container.querySelectorAll("[data-page-card]");
    expect(cards).toHaveLength(2);
    expect(cards[0].parentElement).toHaveClass("space-y-6");
  });
});
