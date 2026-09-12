/**
 * DnD-Kit Helper Utilities
 * Helpers for drag-and-drop with dnd-kit
 */

import {
  closestCenter,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import type { ApiBlock, ApiPage, ApiSection, ApiStep } from "./vault-api";

const SECTION_DRAG_PREFIX = "canvas-section:";
const LANDING_DRAG_PREFIX = "canvas-landing:";

export type CanvasDragData =
  | { kind: "page"; pageId: string; sectionId: string | null }
  | { kind: "section"; sectionId: string; title: string }
  | { kind: "step"; stepId: string; pageId: string }
  | { kind: "block"; blockId: string; pageId: string }
  | {
      kind: "landing";
      insertIndex: number;
      sectionId: string | null;
      label: string;
    };

export type CanvasLayoutUnit =
  | { kind: "page"; id: string; page: ApiPage }
  | { kind: "section"; id: string; section: ApiSection; pages: ApiPage[] };

export type PageDropDestination =
  | { kind: "page"; pageId: string }
  | { kind: "landing"; insertIndex: number; sectionId: string | null };

export interface CanvasLayoutMove {
  pages: ApiPage[];
  updates: Array<{ id: string; order: number; sectionId: string | null }>;
}

export function sectionDragId(sectionId: string): string {
  return `${SECTION_DRAG_PREFIX}${sectionId}`;
}

export function landingDragId(index: number): string {
  return `${LANDING_DRAG_PREFIX}${index}`;
}

export function sortableTransition(transition: string | undefined): string | undefined {
  if (typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return "none";
  }
  return transition;
}

export function isCanvasDragData(value: unknown): value is CanvasDragData {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }
  const kind = (value as { kind: unknown }).kind;
  return kind === "page"
    || kind === "section"
    || kind === "step"
    || kind === "block"
    || kind === "landing";
}

export function canvasAllowedDropKinds(
  activeKind: CanvasDragData["kind"],
): Set<CanvasDragData["kind"]> {
  if (activeKind === "page") {
    return new Set(["page", "landing"]);
  }
  if (activeKind === "section") {
    return new Set(["section", "page"]);
  }
  if (activeKind === "step") {
    return new Set(["page", "step"]);
  }
  return new Set(["page", "step", "block"]);
}

export const canvasCollisionDetection: CollisionDetection = (args) => {
  const activeData = args.active.data.current;
  if (!isCanvasDragData(activeData)) {
    return closestCenter(args);
  }

  const allowedKinds = canvasAllowedDropKinds(activeData.kind);

  const droppableContainers = args.droppableContainers.filter((container) => {
    const data = container.data.current;
    if (!isCanvasDragData(data) || !allowedKinds.has(data.kind)) {
      return false;
    }
    if (activeData.kind !== "section") {
      return true;
    }
    if (data.kind === "section") {
      return data.sectionId !== activeData.sectionId;
    }
    return data.kind !== "page" || data.sectionId !== activeData.sectionId;
  });

  return closestCenter({ ...args, droppableContainers });
};

/**
 * Keeps keyboard Section sorting at the top-level hierarchy. The stock
 * sortable getter otherwise sees the active Section's nested page droppables
 * first and can cycle between the wrapper and its own first page forever.
 */
export const canvasKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const activeData = args.context.active?.data.current;
  if (!isCanvasDragData(activeData)
    || activeData.kind !== "section"
    || (event.code !== "ArrowUp" && event.code !== "ArrowDown")) {
    return sortableKeyboardCoordinates(event, args);
  }

  const collisionRect = args.context.collisionRect;
  if (!collisionRect) {
    return undefined;
  }

  const direction = event.code === "ArrowUp" ? -1 : 1;
  const candidates = args.context.droppableContainers.getEnabled().flatMap((container) => {
    const data = container.data.current;
    const rect = args.context.droppableRects.get(container.id);
    if (!rect || !isCanvasDragData(data)) {
      return [];
    }
    const isDifferentSection = data.kind === "section" && data.sectionId !== activeData.sectionId;
    const isOutsideActiveSection = data.kind === "page" && data.sectionId !== activeData.sectionId;
    if (!isDifferentSection && !isOutsideActiveSection) {
      return [];
    }
    if (direction < 0 ? rect.top >= collisionRect.top : rect.top <= collisionRect.top) {
      return [];
    }
    return [{ rect, distance: Math.abs(rect.top - collisionRect.top) }];
  });

  const closest = candidates.sort((left, right) => left.distance - right.distance)[0];
  if (closest === undefined) {
    return undefined;
  }

  event.preventDefault();
  return { x: closest.rect.left, y: closest.rect.top };
};

/**
 * Builds the only legal canvas hierarchy: a top-level ungrouped page or one
 * contiguous Section block. Unknown memberships are treated as ungrouped so
 * a transient pages/Sections cache race cannot strand the canvas.
 */
export function buildCanvasLayout(
  inputPages: ApiPage[],
  sections: ApiSection[],
): CanvasLayoutUnit[] {
  const pages = [...inputPages].sort((a, b) => a.order - b.order);
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const pagesBySection = new Map<string, ApiPage[]>();

  for (const page of pages) {
    if (page.sectionId && sectionById.has(page.sectionId)) {
      const grouped = pagesBySection.get(page.sectionId) ?? [];
      grouped.push(page);
      pagesBySection.set(page.sectionId, grouped);
    }
  }

  const units: CanvasLayoutUnit[] = [];
  const emittedSections = new Set<string>();

  for (const page of pages) {
    const section = page.sectionId ? sectionById.get(page.sectionId) : undefined;
    if (!section) {
      units.push({
        kind: "page",
        id: page.id,
        page: page.sectionId ? { ...page, sectionId: null } : page,
      });
      continue;
    }
    if (emittedSections.has(section.id)) {
      continue;
    }

    const groupedPages = pagesBySection.get(section.id) ?? [];
    const firstIndex = pages.findIndex((candidate) => candidate.id === groupedPages[0]?.id);
    const contiguous = groupedPages.every(
      (candidate, offset) => pages[firstIndex + offset]?.id === candidate.id,
    );
    if (!contiguous) {
      throw new Error(`Section "${section.title}" does not contain a contiguous page span`);
    }

    emittedSections.add(section.id);
    units.push({
      kind: "section",
      id: sectionDragId(section.id),
      section,
      pages: groupedPages,
    });
  }

  return units;
}

export function flattenCanvasLayout(units: CanvasLayoutUnit[]): ApiPage[] {
  const flattened: ApiPage[] = [];
  for (const unit of units) {
    if (unit.kind === "page") {
      flattened.push({ ...unit.page, sectionId: null });
    } else {
      flattened.push(...unit.pages.map((page) => ({
        ...page,
        sectionId: unit.section.id,
      })));
    }
  }
  return flattened.map((page, order) => ({ ...page, order }));
}

function toLayoutMove(pages: ApiPage[]): CanvasLayoutMove {
  const ordered = pages.map((page, order) => ({ ...page, order }));
  return {
    pages: ordered,
    updates: ordered.map((page) => ({
      id: page.id,
      order: page.order,
      sectionId: page.sectionId ?? null,
    })),
  };
}

/** Moves one page while assigning membership from the landing target. */
export function movePageInCanvasLayout(
  inputPages: ApiPage[],
  sections: ApiSection[],
  activePageId: string,
  destination: PageDropDestination,
): CanvasLayoutMove | null {
  const pages = flattenCanvasLayout(buildCanvasLayout(inputPages, sections));
  const oldIndex = pages.findIndex((page) => page.id === activePageId);
  if (oldIndex < 0) {
    return null;
  }

  const activePage = pages[oldIndex];
  let insertIndex: number;
  let sectionId: string | null;

  if (destination.kind === "page") {
    const targetIndex = pages.findIndex((page) => page.id === destination.pageId);
    if (targetIndex < 0) {
      return null;
    }
    insertIndex = targetIndex;
    sectionId = pages[targetIndex].sectionId ?? null;
  } else {
    insertIndex = destination.insertIndex;
    sectionId = destination.sectionId;
  }

  const withoutActive = pages.filter((page) => page.id !== activePageId);
  if (destination.kind === "landing" && insertIndex > oldIndex) {
    insertIndex -= 1;
  }
  const boundedIndex = Math.max(0, Math.min(insertIndex, withoutActive.length));
  withoutActive.splice(boundedIndex, 0, { ...activePage, sectionId });

  // Rebuilding is the invariant check: every output must remain expressible as
  // complete top-level Section blocks plus ungrouped pages.
  const result = toLayoutMove(withoutActive);
  buildCanvasLayout(result.pages, sections);
  return result;
}

/** Moves a complete Section page span as one top-level block. */
export function moveSectionInCanvasLayout(
  inputPages: ApiPage[],
  sections: ApiSection[],
  activeSectionId: string,
  overData: Extract<CanvasDragData, { kind: "section" | "page" }>,
): CanvasLayoutMove | null {
  const units = buildCanvasLayout(inputPages, sections);
  const oldIndex = units.findIndex(
    (unit) => unit.kind === "section" && unit.section.id === activeSectionId,
  );
  const newIndex = units.findIndex((unit) => {
    if (overData.kind === "section") {
      return unit.kind === "section" && unit.section.id === overData.sectionId;
    }
    return unit.kind === "page"
      ? unit.page.id === overData.pageId
      : unit.pages.some((page) => page.id === overData.pageId);
  });
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return null;
  }

  const reordered = [...units];
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);
  return toLayoutMove(flattenCanvasLayout(reordered));
}

export function findEmptiedSection(
  before: ApiPage[],
  after: ApiPage[],
  sections: ApiSection[],
): ApiSection | null {
  const afterMemberships = new Set(
    after.map((page) => page.sectionId).filter((id): id is string => typeof id === "string"),
  );
  const emptiedId = before.find(
    (page) => page.sectionId && !afterMemberships.has(page.sectionId),
  )?.sectionId;
  return sections.find((section) => section.id === emptiedId) ?? null;
}

export function sectionNamesForMove(
  before: ApiPage[],
  after: ApiPage[],
  sections: ApiSection[],
): string[] {
  const changedIds = new Set<string>();
  const beforeById = new Map(before.map((page) => [page.id, page]));
  for (const page of after) {
    const previous = beforeById.get(page.id);
    if (previous?.order === page.order
      && (previous.sectionId ?? null) === (page.sectionId ?? null)) {
      continue;
    }
    if (previous?.sectionId) {
      changedIds.add(previous.sectionId);
    }
    if (page.sectionId) {
      changedIds.add(page.sectionId);
    }
  }
  return sections.filter((section) => changedIds.has(section.id)).map((section) => section.title);
}

/**
 * Combined item type for steps and blocks on a page
 */
export type PageItem =
  | { kind: "step"; id: string; order: number; data: ApiStep }
  | { kind: "block"; id: string; order: number; data: ApiBlock };

/**
 * Combine and sort steps and blocks by order
 */
export function combinePageItems(
  steps: ApiStep[],
  blocks: ApiBlock[]
): PageItem[] {
  const stepItems: PageItem[] = steps.map((step) => ({
    kind: "step",
    id: step.id,
    order: step.order,
    data: step,
  }));

  const blockItems: PageItem[] = blocks.map((block) => ({
    kind: "block",
    id: block.id,
    order: block.order,
    data: block,
  }));

  return [...stepItems, ...blockItems].sort((a, b) => a.order - b.order);
}

/**
 * Recompute orders after a drag-and-drop reorder
 * Returns separate arrays for steps and blocks with updated orders
 */
export function recomputeOrders(
  items: PageItem[],
  fromIndex: number,
  toIndex: number
): {
  steps: Array<{ id: string; order: number }>;
  blocks: Array<{ id: string; order: number }>;
} {
  // Create a copy and move the item
  const reordered = [...items];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);

  // Reassign orders sequentially
  const steps: Array<{ id: string; order: number }> = [];
  const blocks: Array<{ id: string; order: number }> = [];

  reordered.forEach((item, index) => {
    if (item.kind === "step") {
      steps.push({ id: item.id, order: index });
    } else {
      blocks.push({ id: item.id, order: index });
    }
  });

  return { steps, blocks };
}

/**
 * Get the next order number for a new item
 */
export function getNextOrder(items: PageItem[]): number {
  if (items.length === 0) {
    return 0;
  }
  return Math.max(...items.map((i) => i.order)) + 1;
}
