/**
 * DnD-Kit Helper Utilities
 * Helpers for drag-and-drop with dnd-kit
 */

import type { ApiStep, ApiBlock } from "./vault-api";

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
  if (items.length === 0) return 0;
  return Math.max(...items.map((i) => i.order)) + 1;
}
