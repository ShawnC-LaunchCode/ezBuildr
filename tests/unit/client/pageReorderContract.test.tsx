// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePageDragAndDrop } from "@/components/builder/pages/PageCanvas.hooks";
import { pageAPI, type ApiPage } from "@/lib/vault-api";

import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";

const mocks = vi.hoisted(() => ({
  reorderPages: vi.fn(),
}));

vi.mock("@/lib/vault-hooks", () => ({
  useReorderPages: () => ({ mutate: mocks.reorderPages }),
  useReorderSteps: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useUpdateStep: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function page(id: string, order: number, sectionId?: string | null): ApiPage {
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

describe("page reorder client contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.reorderPages.mockReset();
  });

  it("sends explicit nullable Section membership for every canvas page", async () => {
    const pages = [page("page-a", 0, "section-a"), page("page-b", 1)];
    const { result } = renderHook(() => usePageDragAndDrop("workflow-1", pages, {}));

    act(() => {
      result.current.handleDragStart({ active: { id: "page-a" } } as DragStartEvent);
    });
    await act(async () => {
      await result.current.handleDragEnd({
        active: { id: "page-a" },
        over: { id: "page-b" },
      } as DragEndEvent);
    });

    expect(mocks.reorderPages).toHaveBeenCalledWith(
      {
        workflowId: "workflow-1",
        pages: [
          { id: "page-b", order: 0, sectionId: null },
          { id: "page-a", order: 1, sectionId: "section-a" },
        ],
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("defaults deleteEmptySectionIds to an empty list on the wire", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ message: "ok", affectedSkipRules: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

    await pageAPI.reorder("workflow-1", [
      { id: "page-a", order: 0, sectionId: null },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workflows/workflow-1/pages/reorder",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          pages: [{ id: "page-a", order: 0, sectionId: null }],
          deleteEmptySectionIds: [],
        }),
      }),
    );
  });
});
