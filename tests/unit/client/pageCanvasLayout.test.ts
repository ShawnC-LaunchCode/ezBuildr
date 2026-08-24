import { describe, expect, it } from "vitest";

import {
  buildCanvasLayout,
  canvasAllowedDropKinds,
  canvasKeyboardCoordinates,
  findEmptiedSection,
  movePageInCanvasLayout,
  moveSectionInCanvasLayout,
} from "@/lib/dnd";
import type { ApiPage, ApiSection } from "@/lib/vault-api";

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

const pages = [
  page("asset-a", 0, "assets"),
  page("asset-b", 1, "assets"),
  page("contact", 2, null),
  page("debt-a", 3, "debts"),
  page("debt-b", 4, "debts"),
];

function compact(move: ReturnType<typeof movePageInCanvasLayout>) {
  return move?.updates.map(({ id, sectionId }) => [id, sectionId]);
}

describe("page canvas complete-layout helpers", () => {
  it("models each Section as one top-level block while preserving ungrouped order", () => {
    const layout = buildCanvasLayout(pages, sections);

    expect(layout.map((unit) => unit.kind === "section" ? unit.section.id : unit.page.id))
      .toEqual(["assets", "contact", "debts"]);
    expect(layout[0]).toMatchObject({
      kind: "section",
      pages: [{ id: "asset-a" }, { id: "asset-b" }],
    });
  });

  it("rejects a discontiguous Section input instead of constructing an invalid block", () => {
    const invalid = [
      page("asset-a", 0, "assets"),
      page("contact", 1, null),
      page("asset-b", 2, "assets"),
    ];

    expect(() => buildCanvasLayout(invalid, sections)).toThrow(
      'Section "Assets" does not contain a contiguous page span',
    );
  });

  it("moves an ungrouped page into a Section in one complete layout", () => {
    const move = movePageInCanvasLayout(
      pages,
      sections,
      "contact",
      { kind: "page", pageId: "asset-b" },
    );

    expect(compact(move)).toEqual([
      ["asset-a", "assets"],
      ["contact", "assets"],
      ["asset-b", "assets"],
      ["debt-a", "debts"],
      ["debt-b", "debts"],
    ]);
  });

  it("moves a page out of a multi-page Section as ungrouped", () => {
    const move = movePageInCanvasLayout(
      pages,
      sections,
      "asset-b",
      { kind: "landing", insertIndex: 3, sectionId: null },
    );

    expect(compact(move)).toEqual([
      ["asset-a", "assets"],
      ["contact", null],
      ["asset-b", null],
      ["debt-a", "debts"],
      ["debt-b", "debts"],
    ]);
  });

  it("moves a page between Sections without exposing a broken span", () => {
    const move = movePageInCanvasLayout(
      pages,
      sections,
      "asset-b",
      { kind: "page", pageId: "debt-a" },
    );

    expect(compact(move)).toEqual([
      ["asset-a", "assets"],
      ["contact", null],
      ["debt-a", "debts"],
      ["asset-b", "debts"],
      ["debt-b", "debts"],
    ]);
  });

  it("moves a Section and all its pages as one contiguous top-level unit", () => {
    const move = moveSectionInCanvasLayout(
      pages,
      sections,
      "debts",
      { kind: "section", sectionId: "assets", title: "Assets" },
    );

    expect(move?.updates.map(({ id, sectionId }) => [id, sectionId])).toEqual([
      ["debt-a", "debts"],
      ["debt-b", "debts"],
      ["asset-a", "assets"],
      ["asset-b", "assets"],
      ["contact", null],
    ]);
  });

  it("retains the exact last-page move and identifies the emptied Section locally", () => {
    const onePageSection = [
      page("asset-a", 0, "assets"),
      page("contact", 1, null),
      page("debt-a", 2, "debts"),
    ];
    const move = movePageInCanvasLayout(
      onePageSection,
      sections,
      "asset-a",
      { kind: "landing", insertIndex: 2, sectionId: null },
    );

    expect(move?.updates).toEqual([
      { id: "contact", order: 0, sectionId: null },
      { id: "asset-a", order: 1, sectionId: null },
      { id: "debt-a", order: 2, sectionId: "debts" },
    ]);
    expect(findEmptiedSection(onePageSection, move?.pages ?? [], sections))
      .toMatchObject({ id: "assets", title: "Assets" });
  });

  it("filters step collisions away from new Section, landing, and block droppables", () => {
    expect([...canvasAllowedDropKinds("step")]).toEqual(["page", "step"]);
    expect([...canvasAllowedDropKinds("page")]).toEqual(["page", "landing"]);
    expect([...canvasAllowedDropKinds("section")]).toEqual(["section", "page"]);
  });

  it("moves keyboard Section coordinates past its own nested pages", () => {
    const containers = [
      { id: "canvas-section:assets", disabled: false, data: { current: { kind: "section", sectionId: "assets", title: "Assets" } } },
      { id: "asset-a", disabled: false, data: { current: { kind: "page", pageId: "asset-a", sectionId: "assets" } } },
      { id: "contact", disabled: false, data: { current: { kind: "page", pageId: "contact", sectionId: null } } },
    ];
    const rect = (top: number) => ({
      bottom: top + 100,
      height: 100,
      left: 20,
      right: 220,
      top,
      width: 200,
      x: 20,
      y: top,
    });
    const args = {
      active: "canvas-section:assets",
      currentCoordinates: { x: 20, y: 100 },
      context: {
        active: { id: "canvas-section:assets", data: { current: containers[0].data.current }, rect: { current: { initial: null, translated: null } } },
        collisionRect: rect(100),
        droppableContainers: { getEnabled: () => containers },
        droppableRects: new Map([
          ["canvas-section:assets", rect(100)],
          ["asset-a", rect(180)],
          ["contact", rect(340)],
        ]),
      },
    } as unknown as Parameters<typeof canvasKeyboardCoordinates>[1];

    const event = { code: "ArrowDown", preventDefault: () => undefined } as unknown as KeyboardEvent;
    expect(canvasKeyboardCoordinates(event, args))
      .toEqual({ x: 20, y: 340 });
  });

  it("returns no move for missing page targets and same-unit Section drops", () => {
    expect(movePageInCanvasLayout(
      pages,
      sections,
      "asset-a",
      { kind: "page", pageId: "missing-page" },
    )).toBeNull();
    expect(movePageInCanvasLayout(
      pages,
      sections,
      "missing-page",
      { kind: "page", pageId: "asset-a" },
    )).toBeNull();
    expect(moveSectionInCanvasLayout(
      pages,
      sections,
      "assets",
      { kind: "page", pageId: "asset-b", sectionId: "assets" },
    )).toBeNull();
  });
});
