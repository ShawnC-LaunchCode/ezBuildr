// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePageDragAndDrop } from "@/components/builder/pages/PageCanvas.hooks";
import {
  FetchApiError,
  type ApiPage,
  type ApiSection,
  type ApiStep,
} from "@/lib/vault-api";

import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  reorderPages: vi.fn(),
  reorderSteps: vi.fn(),
  reorderStepsAsync: vi.fn(),
  updateStep: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/lib/vault-hooks", () => ({
  useReorderPages: () => ({ mutateAsync: mocks.reorderPages, isPending: false }),
  useReorderSteps: () => ({
    mutate: mocks.reorderSteps,
    mutateAsync: mocks.reorderStepsAsync,
  }),
  useUpdateStep: () => ({ mutateAsync: mocks.updateStep }),
}));

const sections: ApiSection[] = [
  {
    id: "assets",
    workflowId: "workflow-1",
    title: "Assets",
    description: null,
    createdAt: "2026-08-23T00:00:00.000Z",
  },
  {
    id: "debts",
    workflowId: "workflow-1",
    title: "Debts",
    description: null,
    createdAt: "2026-08-23T00:00:00.000Z",
  },
];

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

const groupedPages = [
  page("asset-a", 0, "assets"),
  page("asset-b", 1, "assets"),
  page("contact", 2, null),
  page("debt-a", 3, "debts"),
  page("debt-b", 4, "debts"),
];

function start(id: string, data: object): DragStartEvent {
  return { active: { id, data: { current: data } } } as DragStartEvent;
}

function end(
  activeId: string,
  activeData: object,
  overId: string,
  overData: object,
): DragEndEvent {
  return {
    active: { id: activeId, data: { current: activeData } },
    over: { id: overId, data: { current: overData } },
  } as DragEndEvent;
}

function pageUpdates() {
  return mocks.reorderPages.mock.calls.at(-1)?.[0].pages as Array<{
    id: string;
    order: number;
    sectionId: string | null;
  }>;
}

describe("PageCanvas Section drag-and-drop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reorderPages.mockResolvedValue({ affectedSkipRules: [] });
    mocks.reorderStepsAsync.mockResolvedValue(undefined);
    mocks.updateStep.mockResolvedValue(undefined);
  });

  it("moves an ungrouped page into a named Section and announces the landing", async () => {
    const { result } = renderHook(() =>
      usePageDragAndDrop("workflow-1", groupedPages, sections, {})
    );
    const activeData = { kind: "page", pageId: "contact", sectionId: null };
    const overData = { kind: "page", pageId: "asset-b", sectionId: "assets" };

    act(() => result.current.handleDragStart(start("contact", activeData)));
    act(() => result.current.handleDragOver({
      active: start("contact", activeData).active,
      over: end("contact", activeData, "asset-b", overData).over,
    } as DragOverEvent));
    expect(result.current.landingLabel).toBe('Land in Section “Assets” near “asset-b”');

    await act(async () => {
      await result.current.handleDragEnd(end("contact", activeData, "asset-b", overData));
    });
    expect(pageUpdates().find(({ id }) => id === "contact")?.sectionId).toBe("assets");
  });

  it("moves a page out of a multi-page Section as ungrouped", async () => {
    const { result } = renderHook(() =>
      usePageDragAndDrop("workflow-1", groupedPages, sections, {})
    );

    await act(async () => {
      await result.current.handleDragEnd(end(
        "asset-b",
        { kind: "page", pageId: "asset-b", sectionId: "assets" },
        "canvas-landing:3",
        { kind: "landing", insertIndex: 3, sectionId: null, label: "Ungrouped" },
      ));
    });

    expect(pageUpdates().find(({ id }) => id === "asset-b")?.sectionId).toBeNull();
    expect(mocks.reorderPages.mock.calls[0][0].deleteEmptySectionIds).toEqual([]);
  });

  it("moves a page between Sections in the same atomic layout request", async () => {
    const { result } = renderHook(() =>
      usePageDragAndDrop("workflow-1", groupedPages, sections, {})
    );

    await act(async () => {
      await result.current.handleDragEnd(end(
        "asset-b",
        { kind: "page", pageId: "asset-b", sectionId: "assets" },
        "debt-a",
        { kind: "page", pageId: "debt-a", sectionId: "debts" },
      ));
    });

    expect(pageUpdates().find(({ id }) => id === "asset-b")?.sectionId).toBe("debts");
    expect(pageUpdates().map(({ order }) => order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("reorders a Section with its complete page span", async () => {
    const { result } = renderHook(() =>
      usePageDragAndDrop("workflow-1", groupedPages, sections, {})
    );

    await act(async () => {
      await result.current.handleDragEnd(end(
        "canvas-section:debts",
        { kind: "section", sectionId: "debts", title: "Debts" },
        "canvas-section:assets",
        { kind: "section", sectionId: "assets", title: "Assets" },
      ));
    });

    expect(pageUpdates().slice(0, 2).map(({ id, sectionId }) => [id, sectionId]))
      .toEqual([["debt-a", "debts"], ["debt-b", "debts"]]);
  });

  it("rolls back a last-page 409 and cancel performs no retry", async () => {
    const onePageSection = [page("asset-a", 0, "assets"), page("contact", 1, null)];
    mocks.reorderPages.mockRejectedValueOnce(
      new FetchApiError('Section "Assets" cannot be empty', 409),
    );
    const { result } = renderHook(() =>
      usePageDragAndDrop("workflow-1", onePageSection, [sections[0]], {})
    );

    await act(async () => {
      await result.current.handleDragEnd(end(
        "asset-a",
        { kind: "page", pageId: "asset-a", sectionId: "assets" },
        "canvas-landing:2",
        { kind: "landing", insertIndex: 2, sectionId: null, label: "Ungrouped" },
      ));
    });
    expect(result.current.pendingEmptySection).toMatchObject({ id: "assets", title: "Assets" });

    act(() => result.current.cancelPendingMove());
    expect(result.current.pendingEmptySection).toBeNull();
    expect(mocks.reorderPages).toHaveBeenCalledTimes(1);
  });

  it("confirms a last-page move with the exact rejected layout and Section deletion id", async () => {
    const onePageSection = [page("asset-a", 0, "assets"), page("contact", 1, null)];
    mocks.reorderPages
      .mockRejectedValueOnce(new FetchApiError('Section "Assets" cannot be empty', 409))
      .mockResolvedValueOnce({ affectedSkipRules: [] });
    const { result } = renderHook(() =>
      usePageDragAndDrop("workflow-1", onePageSection, [sections[0]], {})
    );

    await act(async () => {
      await result.current.handleDragEnd(end(
        "asset-a",
        { kind: "page", pageId: "asset-a", sectionId: "assets" },
        "canvas-landing:2",
        { kind: "landing", insertIndex: 2, sectionId: null, label: "Ungrouped" },
      ));
    });
    const rejectedPages = mocks.reorderPages.mock.calls[0][0].pages;

    act(() => result.current.confirmPendingMove());
    await waitFor(() => expect(mocks.reorderPages).toHaveBeenCalledTimes(2));
    expect(mocks.reorderPages.mock.calls[1][0]).toEqual({
      workflowId: "workflow-1",
      pages: rejectedPages,
      deleteEmptySectionIds: ["assets"],
    });
  });

  it("surfaces the exact named 400 message once after rollback", async () => {
    mocks.reorderPages.mockRejectedValueOnce(
      new FetchApiError('Section "Assets" must contain a contiguous span of pages', 400),
    );
    const { result } = renderHook(() =>
      usePageDragAndDrop("workflow-1", groupedPages, sections, {})
    );

    await act(async () => {
      await result.current.handleDragEnd(end(
        "asset-b",
        { kind: "page", pageId: "asset-b", sectionId: "assets" },
        "debt-a",
        { kind: "page", pageId: "debt-a", sectionId: "debts" },
      ));
    });

    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Section layout rejected",
      description: expect.stringContaining(
        'Section "Assets" must contain a contiguous span of pages',
      ),
    }));
  });

  it("preserves skip-rule warnings through both page and Section submission paths", async () => {
    const warning = {
      ruleId: "rule-1",
      conditionPageId: "debt-a",
      conditionPageTitle: "Debt A",
      targetPageId: "asset-a",
      targetPageTitle: "Asset A",
    };
    mocks.reorderPages.mockResolvedValue({ affectedSkipRules: [warning] });
    const { result } = renderHook(() =>
      usePageDragAndDrop("workflow-1", groupedPages, sections, {})
    );

    await act(async () => {
      await result.current.handleDragEnd(end(
        "contact",
        { kind: "page", pageId: "contact", sectionId: null },
        "asset-b",
        { kind: "page", pageId: "asset-b", sectionId: "assets" },
      ));
      await result.current.handleDragEnd(end(
        "canvas-section:debts",
        { kind: "section", sectionId: "debts", title: "Debts" },
        "canvas-section:assets",
        { kind: "section", sectionId: "assets", title: "Assets" },
      ));
    });

    expect(mocks.toast).toHaveBeenCalledTimes(2);
    expect(mocks.toast).toHaveBeenNthCalledWith(1, expect.objectContaining({
      title: "A skip rule can no longer fire",
    }));
    expect(mocks.toast).toHaveBeenNthCalledWith(2, expect.objectContaining({
      title: "A skip rule can no longer fire",
    }));
  });

  it("keeps step sorting on page/step targets when Sections are present", async () => {
    const step = (id: string, order: number): ApiStep => ({
      id,
      workflowId: "workflow-1",
      pageId: "asset-a",
      type: "short_text",
      title: id,
      description: null,
      alias: id,
      required: false,
      order,
      config: {},
      createdAt: "2026-08-23T00:00:00.000Z",
    });
    const steps = { "asset-a": [step("step-a", 0), step("step-b", 1)] };
    const { result } = renderHook(() =>
      usePageDragAndDrop("workflow-1", groupedPages, sections, steps)
    );

    await act(async () => {
      await result.current.handleDragEnd(end(
        "step-a",
        { kind: "step", stepId: "step-a", pageId: "asset-a" },
        "step-b",
        { kind: "step", stepId: "step-b", pageId: "asset-a" },
      ));
    });

    expect(mocks.reorderSteps).toHaveBeenCalledWith({
      pageId: "asset-a",
      steps: [{ id: "step-b", order: 0 }, { id: "step-a", order: 1 }],
    });
  });
});
